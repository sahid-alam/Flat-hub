-- Taking an offer back. Until now an offer, once tapped, stayed up until somebody took it or the day
-- passed — the only way back was to hope nobody did. That made a mis-tap permanent.
--
-- Withdrawing DELETES the offer row. duty_mark is not a ledger (CLAUDE.md names the three: pool_entry,
-- stock_move, chore_event); an offer is an intent that carries no points, and an intent taken back
-- before anyone acted on it simply wasn't. Vouches stay immutable — they are evidence about someone
-- else's work, and nothing here touches them.
--
-- There is still no DELETE grant on duty_mark. The only way to remove a row is this function, which
-- removes exactly one kind of row under exactly these conditions:
--   * it is an OFFER, and it is the caller's own (by_member_id = member_id = the caller's member);
--   * nobody has taken it — no live 'swapped' chore_event on that slot. Once a mate has tapped Take it,
--     the turn is theirs; taking the offer back then would strand a claim with nothing it answered.
--
-- The race: Rhea taps Take it while Ansh taps Take back. Both run under READ COMMITTED, and each could
-- pass its check against the other's uncommitted row — a claim that answers a deleted offer. So both
-- sides take the same per-slot advisory lock: the withdrawal here, the claim in check_chore_claimable.
-- Whichever commits second sees the first.

create function private.slot_lock(p_household uuid, p_duty uuid, p_due date, p_member uuid) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(
    'duty_slot:' || p_household::text || ':' || p_duty::text || ':' || p_due::text || ':' || p_member::text, 0));
$$;
revoke all on function private.slot_lock(uuid, uuid, date, uuid) from public;
-- The claim trigger runs as the caller, so the caller must be able to take the lock. `private` is not
-- exposed over the API (the same arrangement as my_household_ids), and all it does is wait.
grant execute on function private.slot_lock(uuid, uuid, date, uuid) to authenticated;

create function public.withdraw_offer(p_duty uuid, p_due date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me record;
begin
  -- The caller's own member row in the duty's flat. No row: not signed in, or not in that flat.
  select m.id, m.household_id into me
  from public.member m join public.duty d on d.household_id = m.household_id
  where d.id = p_duty and m.user_id = (select auth.uid());
  if me.id is null then
    raise exception 'no such duty' using errcode = 'P0002';
  end if;

  perform private.slot_lock(me.household_id, p_duty, p_due, me.id);

  if exists (
    select 1 from public.chore_event e
    where e.household_id = me.household_id and e.duty_id = p_duty and e.due_on = p_due
      and e.member_id = me.id and e.outcome = 'swapped' and e.reverses_id is null
      and not exists (select 1 from public.chore_event r where r.reverses_id = e.id)
  ) then
    raise exception 'somebody has already taken it' using errcode = '23514';
  end if;

  delete from public.duty_mark
  where household_id = me.household_id and duty_id = p_duty and due_on = p_due
    and member_id = me.id and by_member_id = me.id and kind = 'offer';
  -- Nothing deleted is fine: a second tap, or a retry after a lost response, is a no-op.
end $$;

revoke all on function public.withdraw_offer(uuid, date) from public, anon;
grant execute on function public.withdraw_offer(uuid, date) to authenticated;

-- The claim side of the lock. Same body as 20261008210000, plus the slot lock before the offer check.
create or replace function private.check_chore_claimable() returns trigger
language plpgsql set search_path = '' as $$
declare
  caller uuid = (select auth.uid());
begin
  if new.reverses_id is null and new.outcome = 'swapped' then
    perform private.slot_lock(new.household_id, new.duty_id, new.due_on, new.member_id);
    if not exists (
      select 1 from public.duty_mark m
      where m.household_id = new.household_id and m.kind = 'offer'
        and m.duty_id = new.duty_id and m.due_on = new.due_on and m.member_id = new.member_id
    ) then
      raise exception 'a duty can only be taken after it is offered' using errcode = '23514';
    end if;
    -- You take a duty; you are not handed one. The claimer must be the caller.
    if caller is not null and not exists (
      select 1 from public.member m
      where m.id = new.to_member_id and m.household_id = new.household_id and m.user_id = caller
    ) then
      raise exception 'a duty can only be taken by the mate taking it' using errcode = '23514';
    end if;
  end if;

  if new.reverses_id is null and new.outcome = 'done' and caller is not null and not exists (
    select 1 from public.member m
    where m.id = new.member_id and m.household_id = new.household_id and m.user_id = caller
  ) then
    raise exception 'you can only tick your own duty' using errcode = '23514';
  end if;
  return new;
end $$;
