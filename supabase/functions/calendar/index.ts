// GET /functions/v1/calendar?token=… — one mate's turns as an iCalendar feed, for Google or Apple
// Calendar to subscribe to. Calendar apps cannot sign in, so the gateway's JWT check is off for this
// function (config.toml) and the long random token in the URL is the whole credential: it names one
// mate, and the feed shows that mate's duty dates and nothing else. See 20261017150000_calendar_feed.sql.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// NOTE: these imports reach outside supabase/functions, as notify's do. See notify/README.md § Deploying.
import { icsFeed, shiftDate } from '../../../src/domain/calendar.ts';
import { rota, type ChoreEvent, type DatedDuty } from '../../../src/domain/duties.ts';
import { istDate, type Absence, type Member } from '../../../src/domain/kitty.ts';

const PAST = 14; // a fortnight back, so a turn ticked late in the week still shows done
const AHEAD = 60; // two months on

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{48}$/.test(token)) return new Response('Not found', { status: 404 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data: feed } = await db.from('calendar_feed').select('member_id, household_id').eq('token', token).maybeSingle();
  // The same answer for a wrong token as for no token: nothing to learn by guessing.
  if (!feed) return new Response('Not found', { status: 404 });
  const h = feed.household_id as string;

  const [household, duties, rules, members, absences, events] = await Promise.all([
    db.from('household').select('name').eq('id', h).single(),
    db.from('duty').select('*').eq('household_id', h),
    db.from('duty_rule').select('duty_id, starts_on, turns, on_miss, roster, created_at, every_days, weekdays, group_size, schedule, fixed_member_id, follows_id').eq('household_id', h).order('starts_on').order('created_at'),
    db.from('member').select('id, joined_on, left_on').eq('household_id', h),
    db.from('member_absence').select('member_id, from_date, to_date, created_at').eq('household_id', h),
    db.from('chore_event').select('*').eq('household_id', h),
  ]);
  for (const r of [household, duties, rules, members, absences, events]) if (r.error) return new Response('Unavailable', { status: 503 });

  const today = istDate(new Date().toISOString());
  const withRules = (duties.data as DatedDuty[]).map((d) => ({
    ...d,
    rules: (rules.data ?? []).filter((r: { duty_id: string }) => r.duty_id === d.id),
  }));
  const anchor = withRules.reduce((a, d) => (istDate(d.created_at) < a ? istDate(d.created_at) : a), today);
  const rows = rota(withRules, members.data as Member[], absences.data as Absence[], events.data as ChoreEvent[], shiftDate(today, -PAST), PAST + AHEAD, anchor, today);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const body = icsFeed(rows, feed.member_id as string, (household.data as { name: string }).name, today, stamp);

  return new Response(body, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="flathub.ics"',
      'cache-control': 'private, max-age=900',
    },
  });
});
