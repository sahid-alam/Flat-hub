-- Two holes found by review, both additive to close.
--
-- 1. duty_mark and duty_photo trusted their actor column. chore_event binds its actor to the session
--    (private.check_chore_claimable), but these two only checked the flat, so any mate could insert
--    an offer of another mate's turn — `(kind = 'offer') = (by_member_id = member_id)` is satisfied
--    by naming that mate twice — or a vouch or a photo "by" somebody who never sent it. An offer
--    made for you is the one thing CLAUDE.md rules out: nobody's turn is given away without a tap.
--    The actor must be the caller's own member row in that flat.
drop policy duty_mark_insert on public.duty_mark;
create policy duty_mark_insert on public.duty_mark for insert to authenticated
  with check (
    household_id in (select private.my_household_ids())
    and by_member_id in (
      select id from public.member where user_id = (select auth.uid()) and household_id = duty_mark.household_id)
  );

drop policy duty_photo_insert on public.duty_photo;
create policy duty_photo_insert on public.duty_photo for insert to authenticated
  with check (
    household_id in (select private.my_household_ids())
    and raised_by in (
      select id from public.member where user_id = (select auth.uid()) and household_id = duty_photo.household_id)
  );

-- 2. The notify Edge Function POSTs to whatever endpoint a member stored, from inside Supabase's
--    network: an SSRF. Endpoints come from the browser's PushManager and are only ever one of the
--    real push services, so anything else is refused here — and again in the function, which also
--    refuses redirects. NOT VALID: new rows are checked; a stray old row is skipped by the function
--    and reaped as dead rather than failing this migration on live.
alter table public.push_subscription add constraint push_subscription_endpoint_known check (
  endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
) not valid;
