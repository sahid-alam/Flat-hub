-- M5 close guards: three holes the review found in 20261004144730_m5_month_close.sql.
-- Additive (create or replace + one new trigger); the live rows are untouched.

-- 1. An absence is judged on the merged RUN it belongs to, not on its own dates.
-- presenceWeights() (src/domain/kitty.ts) joins a member's absences that touch (gap <= 1 day)
-- into one run and only deducts runs of >= 3 days, so a row dated wholly inside an OPEN month
-- can still move a CLOSED month's shares: Jul 30-31 (2 days, no deduction) + a new Aug 1 makes
-- a 3-day run and July suddenly deducts 2 days.
-- ponytail: conservative — it also refuses a row that merely extends a run already crossing the
-- closed month, even where the deduction would not move. A frozen month is a frozen month.
create or replace function private.check_absence_closed() returns trigger
language plpgsql set search_path = '' as $$
declare r public.member_absence; f date; t date; pf date; pt date; m text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  -- widen to the whole run: least/greatest ignore nulls, so no match leaves f/t as they were
  f := r.from_date; t := r.to_date;
  loop
    pf := f; pt := t;
    select least(f, min(a.from_date)), greatest(t, max(a.to_date)) into f, t
      from public.member_absence a
      where a.household_id = r.household_id and a.member_id = r.member_id and a.id <> r.id
        and a.from_date <= t + 1 and a.to_date >= f - 1;
    exit when f = pf and t = pt;
  end loop;
  select c.month into m from public.month_close c
    where c.household_id = r.household_id
      and to_date(c.month, 'YYYY-MM') <= t
      and (to_date(c.month, 'YYYY-MM') + interval '1 month')::date > f
    order by c.month limit 1;
  if m is not null then
    raise exception '% is closed', to_char(to_date(m, 'YYYY-MM'), 'FMMonth YYYY')
      using errcode = 'P0001';
  end if;
  return r;
end $$;

-- 2. spend_line had no close guard. `grant insert on spend_line` plus a balance check that only
-- compares sums means a mate could POST a line (or a zero-sum item/discount pair) against a spend
-- in a closed month and rewrite that frozen month's "What it went on". Same reversal exemption as
-- the spend trigger: a reversal's lines must stay insertable.
create function private.check_spend_line_closed() returns trigger
language plpgsql set search_path = '' as $$
declare s public.spend;
begin
  select * into s from public.spend where id = new.spend_id;
  if s.id is not null and s.reverses_id is null then
    perform private.reject_if_closed(new.household_id, private.ist_month(s.occurred_at));
  end if;
  return new;
end $$;
revoke all on function private.check_spend_line_closed() from public;
grant execute on function private.check_spend_line_closed() to authenticated;
create trigger spend_line_month_closed before insert on public.spend_line
  for each row execute function private.check_spend_line_closed();

-- 3. A reversal is exempt from the freeze, so it must mirror its target completely or it moves
-- the frozen month's breakdown. `source` was the one field left unpinned: a reversal of a closed
-- Zepto spend logged as 'local' shifted that month's store split while the total still netted out.
create or replace function private.check_spend_reversal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null and not exists (
    select 1 from public.spend t
    where t.id = new.reverses_id and t.reverses_id is null
      and t.paid_by = new.paid_by and t.paid_from = new.paid_from and t.total_paise = -new.total_paise
      and t.source = new.source
  ) then
    raise exception 'a reversal must negate an original spend' using errcode = '23514';
  end if;
  return new;
end $$;
