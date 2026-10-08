-- B9 Notifications: the push machine, plus exactly one trigger.
-- Spec: docs/NOTIFICATIONS.md. Additive only; nothing here touches an existing table's rows.
--
-- Three pieces live in this file:
--   1. push_subscription  — one row per member per device. Not a ledger: upserted on every app
--      open, deleted when the push service says the endpoint is gone (404/410).
--   2. notification_send  — the at-most-once key. INSERT-ONLY, like pool_entry and stock_move.
--      pg_cron can retry and a job can overlap itself, so the uniqueness of
--      (household_id, trigger, member_id, due_on) is what stops a double send, not care in code.
--   3. The 08:00 IST clock: pg_cron + pg_net posting into the `notify` Edge Function.
--
-- WHY THE RECIPIENT LIST IS NOT COMPUTED HERE. docs/NOTIFICATIONS.md asks for the condition to
-- live in the SQL so a job with nothing to say sends nothing. For "whose duty is due today" that
-- would mean a second implementation of the rota in PL/pgSQL — assignee() is a fair-share deficit
-- prorated by who was on the roll and who was away, with a last-did tiebreak and provisional
-- credit inside a day (src/domain/duties.ts). Two copies of the rotation that must agree is
-- exactly what CLAUDE.md's one-test-per-rotation rule exists to prevent, and a drifted copy means
-- the push names a different mate than the Duties tab. So the rota stays in TypeScript, the
-- function calls dueToday(), and at-most-once comes from notification_send's unique key instead.
-- What SQL still decides, because only it can: the DATE (today in IST, below) and the cheap
-- "is there any active duty at all" guard, so a flat with no duties is never even invoked.

-- ---------------------------------------------------------------- extensions

-- Both are plain Postgres extensions and are already enabled on the hosted project.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------- push_subscription

create table public.push_subscription (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  member_id uuid not null,
  -- The push service's URL for this one browser install. Globally unique: a browser has one
  -- subscription per service-worker registration, so the same endpoint can never be two rows.
  endpoint text not null unique check (length(endpoint) between 1 and 2000),
  -- RFC 8291 keys, base64url, straight from PushSubscription.getKey().
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  -- Touched on every app open. iOS drops a PushSubscription silently
  -- (https://developer.apple.com/forums/thread/728796), so a stale last_seen_at is the only
  -- signal that a mate's phone has quietly stopped being reachable.
  last_seen_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id)
);
create index on public.push_subscription (household_id);
create index on public.push_subscription (household_id, member_id);

-- ---------------------------------------------------------------- notification_send

-- The whitelist that keeps "notifications for everything" from becoming spam. Only 8 of the 22
-- triggers in docs/NOTIFICATIONS.md may ever buzz a phone; the other 14 are an in-app count or the
-- one 19:00 digest. That split is prose in the doc and a CHECK here, because six people getting
-- ten pushes on an ordinary Tuesday turn them all off inside a fortnight, and on iPhone a revoked
-- permission is close to unrecoverable. Adding a trigger to this list is a deliberate migration,
-- which is the point. B9 ships only 'duty_due_today'; the rest are the documented empty slots.
create table public.notification_send (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  trigger text not null check (trigger in (
    'duty_due_today',       -- #1  ships in B9
    'duty_not_ticked',      -- #2  waiting on nothing — needs only a 20:00 job
    'duty_offered',         -- #3  waiting on v3/b4-duties' offer row
    'duty_offer_claimed',   -- #4  waiting on v3/b4-duties' claim row
    'duty_half_open',       -- #22 waiting on v3/b4-duties' duty.group_size + assignees()
    'meal_plan_missing',    -- #21 waiting on v3/b1-shell-home's meal_plan + duty.plans_meals
    'topup_missing',        -- #7  waiting on nothing — needs only a monthly job
    'reimbursed',           -- #8  waiting on nothing — needs a webhook on pool_entry
    'month_ready_to_close'  -- #17 waiting on nothing — needs only a monthly job
  )),
  member_id uuid not null,
  -- The day the notification is ABOUT, in IST — not when it was sent. For a daily trigger that is
  -- today; for a monthly one it is the date the job falls on. Scoping to today in IST is what
  -- makes a missed day stay missed: a job that did not run never catches up tomorrow.
  due_on date not null,
  sent_at timestamptz not null default now(),
  unique (household_id, id),
  -- The at-most-once key, exactly as docs/NOTIFICATIONS.md § Conditional crons specifies it.
  unique (household_id, trigger, member_id, due_on),
  foreign key (household_id, member_id) references public.member (household_id, id)
);
create index on public.notification_send (household_id, due_on);

-- ---------------------------------------------------------------- RLS

alter table public.push_subscription enable row level security;
alter table public.notification_send enable row level security;

-- A subscription is the device in your pocket: you see and write only your own rows, and only
-- inside your own household. Same own-row shape as absence_delete_own in the kitty migration.
create policy push_subscription_own on public.push_subscription for select to authenticated
  using (
    household_id in (select private.my_household_ids())
    and member_id in (select id from public.member where user_id = (select auth.uid()))
  );
create policy push_subscription_insert_own on public.push_subscription for insert to authenticated
  with check (
    household_id in (select private.my_household_ids())
    and member_id in (select id from public.member where user_id = (select auth.uid()))
  );
-- Not a ledger. The app re-subscribes on every open and upserts, so an endpoint that was reissued
-- for the same device updates its row rather than piling up a second one.
create policy push_subscription_update_own on public.push_subscription for update to authenticated
  using (member_id in (select id from public.member where user_id = (select auth.uid())))
  with check (member_id in (select id from public.member where user_id = (select auth.uid())));
-- "Turn notifications off" is a delete, and it must be the mate's own to make. A dead endpoint is
-- also deleted by the notify function on a 404/410, under the service role.
create policy push_subscription_delete_own on public.push_subscription for delete to authenticated
  using (member_id in (select id from public.member where user_id = (select auth.uid())));

-- Readable by the flat so a screen can say "reminded at 8am", written only by the sender under the
-- service role. No INSERT policy for authenticated on purpose: a mate must not be able to mark a
-- notification as sent and thereby suppress it.
create policy notification_send_read on public.notification_send for select to authenticated
  using (household_id in (select private.my_household_ids()));

revoke all on public.push_subscription, public.notification_send from anon, authenticated;
grant select, insert, delete on public.push_subscription to authenticated;
grant update (endpoint, p256dh, auth, user_agent, last_seen_at) on public.push_subscription to authenticated;
-- Insert-only is enforced by privileges, like chore_event: select and nothing else.
grant select on public.notification_send to authenticated;

-- ---------------------------------------------------------------- the clock

-- One function, one caller. The URL and the shared secret come out of Vault by name so neither is
-- committed to git and neither has to be edited into this migration. The owner creates them once:
--
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify', 'notify_url');
--   select vault.create_secret('<a long random string>', 'notify_secret');
--
-- Until those two rows exist the job raises a warning and posts nothing, which is visible in
-- cron.job_run_details and harms nothing. That is also what happens on a fresh local stack.
create function private.notify_post(trigger text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  url text;
  secret text;
begin
  -- The condition SQL can actually answer, per docs/NOTIFICATIONS.md § Conditional crons rule 1:
  -- a flat with no active duty has nothing to say, so the function is never even invoked.
  if trigger = 'duty_due_today' and not exists (select 1 from public.duty d where d.active) then
    return null;
  end if;

  select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'notify_url';
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'notify_secret';
  if url is null or secret is null then
    raise warning 'notify: vault secrets notify_url / notify_secret are not set; posted nothing';
    return null;
  end if;

  -- `today` is settled HERE, in IST (Asia/Kolkata, the same boundary as istDate() and the
  -- month-close guards), and never by the function. A job that runs at 02:30 UTC is asking about
  -- the day the flat is actually in, and a job that did not run asks about nothing at all.
  return net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := jsonb_build_object('trigger', trigger, 'today', ((now() at time zone 'Asia/Kolkata')::date)::text),
    timeout_milliseconds := 30000
  );
end $$;
revoke all on function private.notify_post(text) from public, anon, authenticated;

-- #1 "your duty is due today": 02:30 UTC = 08:00 IST. Supabase recommends at most 8 concurrent
-- jobs; this is the first of the 7 the doc plans for.
select cron.schedule('b9-duty-due-today', '30 2 * * *', $$ select private.notify_post('duty_due_today') $$);

-- ---------------------------------------------------------------- the empty slots
--
-- Every other trigger in docs/NOTIFICATIONS.md is one line here plus a branch in the function.
-- Nothing below is written as dead code: an unattached function is not a slot, it is litter.
-- Each entry names the branch that is blocked and the table it is blocked on.
--
-- NEEDS NO NEW SCHEMA — these are schedules somebody can add today:
--   #2  duty_not_ticked       cron '0 14 * * *'  (20:00 IST) — dueToday() filtered to no 'done' row
--   #7  topup_missing         cron '30 4 5 * *'  (10:00 IST on the 5th) — suggested_topup(m) > 0
--   #17 month_ready_to_close  cron '30 4 1 * *'  (10:00 IST on the 1st) — no month_close for last
--                             month; treasurer only (household.pool_holder_id)
--
-- WAITING ON ANOTHER BRANCH'S TABLES:
--   #3  duty_offered       v3/b4-duties — the offer row. DB webhook, not cron:
--                            create trigger notify_duty_offered after insert on public.duty_offer
--                              for each row execute function private.notify_row('duty_offered');
--   #4  duty_offer_claimed v3/b4-duties — the claim row. Same webhook shape.
--   #22 duty_half_open     v3/b4-duties — duty.group_size + assignees(). Webhook on chore_event.
--   #21 meal_plan_missing  v3/b1-shell-home — meal_plan + duty.plans_meals. Conditional cron at
--                            05:00 UTC (10:30 IST), only if no meal_plan row for (household, today).
--   #8  reimbursed         no new table, but a webhook on pool_entry where kind='reimbursement',
--                            excluding whoever wrote the row (never notify the actor).
--
-- private.notify_row() is deliberately NOT written yet: the first webhook trigger that needs it
-- will say what its payload has to look like, and a guessed signature is worse than none.
--
-- The remaining 13 triggers (#5, #6, #9–#16, #18–#20) are in-app or digest and must never reach
-- this machine. notification_send's CHECK is what stops one being wired here by accident.
