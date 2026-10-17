-- A private calendar feed per mate: their turns, in Google or Apple Calendar, with that calendar's own
-- reminders. Calendar apps fetch a plain URL and cannot sign in, so the URL carries a long random token
-- and the `calendar` edge function (verify_jwt off) turns a token into one mate's turns. Knowing a
-- token shows that mate's duty dates and nothing else; resetting it cuts off every old copy.

create table public.calendar_feed (
  member_id uuid primary key,
  household_id uuid not null,
  token text not null unique check (length(token) >= 40),
  created_at timestamptz not null default now(),
  foreign key (household_id, member_id) references public.member (household_id, id)
);

alter table public.calendar_feed enable row level security;
-- Your own row only: a token is as good as the feed, so nobody reads another mate's.
create policy calendar_feed_own on public.calendar_feed for select to authenticated
  using (member_id in (select id from public.member where user_id = (select auth.uid())));
revoke all on public.calendar_feed from anon, authenticated;
grant select on public.calendar_feed to authenticated;

-- The only writer. Returns the caller's token in that flat, minting one the first time; `p_reset`
-- replaces it, so a link shared by mistake stops working at once.
create function public.calendar_feed_token(p_household uuid, p_reset boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  t text;
begin
  select id into me from public.member
  where household_id = p_household and user_id = (select auth.uid());
  if me is null then
    raise exception 'not a member of that flat' using errcode = '42501';
  end if;
  insert into public.calendar_feed (member_id, household_id, token)
  values (me, p_household, encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (member_id) do update
    set token = case when p_reset then excluded.token else public.calendar_feed.token end,
        created_at = case when p_reset then now() else public.calendar_feed.created_at end
  returning token into t;
  return t;
end $$;
revoke all on function public.calendar_feed_token(uuid, boolean) from public, anon;
grant execute on function public.calendar_feed_token(uuid, boolean) to authenticated;
