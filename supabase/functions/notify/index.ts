// The one sender. Takes a trigger and a date, works out who should hear about it, and posts an
// encrypted Web Push to each of their devices. Spec: docs/NOTIFICATIONS.md. README.md next door
// has the secrets and the deploy commands.
//
// Called by pg_cron through pg_net (private.notify_post, in 20261008220000_b9_notify.sql) and, one
// day, by Database Webhooks for the row-event triggers. Never by the app: the app has no business
// deciding who gets a push.
//
// THREE RULES THIS FILE ENFORCES, because they are the difference between notifications people
// keep and notifications people switch off within a fortnight:
//
//  1. ONLY THE PUSH TRIGGERS. `PUSH` below is the whole list: 9 of the doc's 22, being the 8 it
//     recommends plus 'duty_offered' (#3), the one it calls a genuine judgement call and the first
//     to demote. Everything else is an in-app count or the single 19:00 digest, and a request to
//     push one is a 400. notification_send's CHECK constraint says the same in the database. Six
//     people getting ten pushes on an ordinary Tuesday is how you lose all six, and on iPhone a
//     revoked permission is close to unrecoverable — so this list is hard to extend on purpose.
//  2. ONE PUSH PER MEMBER PER DAY PER TRIGGER. Claimed by inserting notification_send first; its
//     unique (household_id, trigger, member_id, due_on) turns a pg_cron retry into a no-op.
//  3. NEVER NOTIFY THE ACTOR. Not reachable yet — the one shipped trigger has no actor — but every
//     webhook trigger added later must exclude whoever wrote the row, or Ansh gets a push for
//     every reimbursement he types in himself.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

// The rota lives in ONE place. Reimplementing assignee() in PL/pgSQL would mean two copies of a
// fair-share deficit prorated by presence and absence, with a last-did tiebreak — and a drifted
// copy means this push names a different mate than the Duties tab shows. The migration's header
// explains why that beat putting the condition in SQL, as the doc would otherwise prefer.
// NOTE: this import reaches outside supabase/functions. See README.md § Deploying.
import { dueToday, type ChoreEvent, type DatedDuty } from '../../../src/domain/duties.ts';
import { uuidv7 } from '../../../src/domain/id.ts';
import type { Absence, Member } from '../../../src/domain/kitty.ts';

/** Client-generated UUIDv7 for every row, same as the app (CLAUDE.md): a retry is idempotent. */
const newId = (): string => uuidv7(crypto.getRandomValues(new Uint8Array(16)));

/** The only triggers allowed to buzz a phone. Rule 1. 'duty_offered' is the judgement call. */
const PUSH = new Set([
  'duty_due_today',
  'duty_not_ticked',
  'duty_offered',
  'duty_offer_claimed',
  'duty_partner_pending',
  'meal_plan_due',
  'topup_not_in',
  'reimbursed',
  'month_ready_to_close',
]);

/** What B9 actually implements. The rest are the documented empty slots. */
const IMPLEMENTED = new Set(['duty_due_today']);

type Pref = 'sound' | 'silent' | 'off';
type Payload = { title: string; body: string; url: string; tag: string; silent: boolean };
type Recipient = { householdId: string; memberId: string; dueOn: string; payload: Payload };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// ---------------------------------------------------------------- preferences

/**
 * Per-trigger, per-mate switches. v3/b5-profile OWNS this table; this function only reads it, and
 * reads it defensively: a missing table, a missing row or any error at all means `sound`, the
 * default. Notifications must work before the settings screen exists, and must never crash
 * because it does not.
 */
async function prefs(db: SupabaseClient, householdId: string, trigger: string): Promise<Map<string, Pref>> {
  const out = new Map<string, Pref>();
  const { data, error } = await db
    .from('notification_pref')
    .select('member_id, mode')
    .eq('household_id', householdId)
    .eq('trigger', trigger);
  // 42P01 = undefined_table, PGRST205 = PostgREST cannot find it in the schema cache.
  if (error) {
    if (error.code !== '42P01' && error.code !== 'PGRST205') console.error('prefs lookup failed, defaulting to on', error);
    return out;
  }
  for (const row of data ?? []) if (row.mode === 'silent' || row.mode === 'off') out.set(row.member_id, row.mode);
  return out;
}

// ---------------------------------------------------------------- trigger #1

/** "Your duty is due today" — doc row #1. Unconditional cron; the rota decides who. */
async function dutyDueToday(db: SupabaseClient, today: string): Promise<Recipient[]> {
  const [duties, members, absences, events] = await Promise.all([
    db.from('duty').select('*'),
    db.from('member').select('id, household_id, joined_on, left_on'),
    db.from('member_absence').select('member_id, household_id, from_date, to_date'),
    // The rota only ever looks backwards from `due_on`, so there is no reason to read the future.
    // ponytail: PostgREST caps this at max_rows = 1000 (supabase/config.toml, and the same on the
    // hosted project). assignee() computes each mate's fair-share deficit over EVERY event since
    // the anchor, so once the flat has ~1000 chore events — six mates, a few duties a day, inside
    // a year — this returns an arbitrary 1000 of them and the deficit is computed on a partial
    // ledger. The push would then name a mate the Duties tab does not. src/lib/books.tsx has the
    // same ceiling and its own note, but truncates differently, so the two would disagree rather
    // than fail together. Fix: page with .range() until a short page comes back, in both places.
    db.from('chore_event').select('*').lte('due_on', today),
  ]);
  for (const r of [duties, members, absences, events]) if (r.error) throw r.error;

  const out: Recipient[] = [];
  const households = new Set((duties.data as { household_id: string }[]).map((d) => d.household_id));
  for (const householdId of households) {
    const mine = <T extends { household_id: string }>(rows: T[] | null) =>
      (rows ?? []).filter((r) => r.household_id === householdId);
    const due = dueToday(
      mine(duties.data as (DatedDuty & { household_id: string })[]),
      mine(members.data as (Member & { household_id: string })[]),
      mine(absences.data as (Absence & { household_id: string })[]),
      mine(events.data as (ChoreEvent & { household_id: string })[]),
      today,
    );
    for (const { memberId, dutyNames } of due) {
      const names = dutyNames.join(' · ');
      out.push({
        householdId,
        memberId,
        dueOn: today,
        payload: {
          title: dutyNames.length === 1 ? `${dutyNames[0]} is yours today` : `${dutyNames.length} duties are yours today`,
          body: dutyNames.length === 1 ? 'Tick it off when it is done.' : names,
          url: '/duties',
          // One stable tag per trigger, so a second send replaces the first in the tray.
          tag: 'duty_due_today',
          silent: false,
        },
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- sending

/**
 * One encrypted push. web-push does the RFC 8291 envelope and the VAPID JWT, but its own
 * sendNotification() goes through node:https, so only generateRequestDetails() is used and the
 * POST is a plain fetch — the part of the library that is awkward in Deno is the part we skip.
 */
/**
 * The push services a browser's PushManager actually hands out. Anything else is a stored URL this
 * function must not POST to from inside Supabase's network (SSRF); the table's CHECK refuses new
 * ones, this catches any row older than it.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /\.push\.apple\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export const knownPushService = (endpoint: string): boolean => {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(host));
  } catch {
    return false;
  }
};

async function sendOne(sub: { endpoint: string; p256dh: string; auth: string }, payload: Payload): Promise<number> {
  // 410 is "gone": the caller reaps the row, which is what an endpoint we will never send to deserves.
  if (!knownPushService(sub.endpoint)) return 410;
  const details = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { TTL: 12 * 60 * 60 }, // a duty reminder is worthless tomorrow; let the push service drop it
  );
  const res = await fetch(details.endpoint, {
    method: 'POST',
    headers: details.headers as Record<string, string>,
    body: details.body as Uint8Array,
    redirect: 'manual', // a push service answers; it never redirects, and following one undoes the check above
  });
  return res.status;
}

/**
 * Apple's web push endpoint. Safari ignores showNotification's `silent` option, so there is no such
 * thing as a quiet push on an iPhone — see the comment in deliver().
 */
const isApple = (endpoint: string): boolean => {
  try {
    return new URL(endpoint).hostname.endsWith('.push.apple.com');
  } catch {
    return false; // a row that is not a URL cannot be posted to anyway; sendOne will say so
  }
};

/** Deliver to every device, and reap the dead endpoints. */
async function deliver(db: SupabaseClient, r: Recipient, pref: Pref): Promise<number> {
  const { data: subs, error } = await db
    .from('push_subscription')
    .select('id, endpoint, p256dh, auth')
    .eq('household_id', r.householdId)
    .eq('member_id', r.memberId);
  if (error) throw error;

  const payload = { ...r.payload, silent: pref === 'silent' };
  let sent = 0;
  for (const sub of subs ?? []) {
    // What 'silent' means is decided per DEVICE, exactly as the settings screen promises it
    // (src/app/profile/notifications.tsx): "On Android we set it per notification", and on an
    // iPhone "Sound and Silent decide WHETHER something arrives". Safari drops the silent flag and
    // buzzes anyway, so the only honest way to keep that promise is not to post to Apple at all.
    // The trigger still reaches that mate through the in-app list and the 19:00 digest.
    if (pref === 'silent' && isApple(sub.endpoint)) continue;
    try {
      const status = await sendOne(sub, payload);
      if (status === 404 || status === 410) {
        // The only reliable signal that an endpoint is dead. Drop it, or we post to it forever.
        await db.from('push_subscription').delete().eq('id', sub.id);
      } else if (status >= 200 && status < 300) {
        sent++;
      } else {
        console.error('push rejected', { endpoint: sub.endpoint.slice(0, 60), status });
      }
    } catch (e) {
      // One unreachable device must not cost the other five mates their reminder.
      console.error('push failed', { endpoint: sub.endpoint.slice(0, 60), error: String(e) });
    }
  }
  return sent;
}

// ---------------------------------------------------------------- the door

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  // Trust boundary. Without this, anyone holding the client bundle could fire the 08:00 reminder
  // at 03:00. The same string lives in Vault (notify_secret) so pg_cron can present it.
  const secret = Deno.env.get('NOTIFY_SECRET');
  if (!secret) return json(500, { error: 'NOTIFY_SECRET is not configured' });
  if (req.headers.get('x-notify-secret') !== secret) return json(401, { error: 'unauthorized' });

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return json(500, { error: 'VAPID keys are not configured' });
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let body: { trigger?: unknown; today?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  const trigger = String(body.trigger ?? '');
  const today = String(body.today ?? '');
  // Rule 1, as a 400: an in-app trigger cannot be wired to the sender however convenient it looks.
  if (!PUSH.has(trigger)) return json(400, { error: `'${trigger}' is not a push trigger` });
  if (!IMPLEMENTED.has(trigger)) return json(501, { error: `'${trigger}' is not built yet` });
  // The date is the caller's to decide, in IST, and the SQL decides it. A function that guessed
  // from its own clock would be a day out for a third of every day.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return json(400, { error: 'today must be YYYY-MM-DD' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const recipients = await dutyDueToday(db, today);
    const byHousehold = new Map<string, Map<string, Pref>>();
    let sent = 0;
    let already = 0;
    let off = 0;

    for (const r of recipients) {
      if (!byHousehold.has(r.householdId)) byHousehold.set(r.householdId, await prefs(db, r.householdId, trigger));
      const pref = byHousehold.get(r.householdId)!.get(r.memberId) ?? 'sound';
      if (pref === 'off') {
        off++;
        continue;
      }

      // Rule 2: CLAIM FIRST, then send. The insert is the lock — if two overlapping cron runs race
      // here, exactly one wins the unique key and the other skips. The trade is deliberate: a
      // claim that is followed by a failed send means a reminder nobody got, and a lost reminder
      // is cheaper than a phone that buzzes twice for the same duty. Everything a notification
      // says is already on the screen it points at, so a miss costs nothing — a duplicate costs
      // trust, and this is the app's one chance to not be noise.
      const { error } = await db.from('notification_send').insert({
        id: newId(),
        household_id: r.householdId,
        trigger,
        member_id: r.memberId,
        due_on: r.dueOn,
      });
      if (error) {
        if (error.code === '23505') already++;
        else console.error('could not claim a send', error);
        continue;
      }
      sent += await deliver(db, r, pref);
    }
    return json(200, { trigger, today, recipients: recipients.length, sent, already, off });
  } catch (e) {
    console.error('notify failed', e);
    return json(500, { error: String(e) });
  }
});
