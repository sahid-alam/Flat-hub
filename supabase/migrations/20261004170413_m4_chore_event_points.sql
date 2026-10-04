-- M4 fix: snapshot the effort price on the chore_event, the way money ledgers snapshot paise.
-- Before this, donePoints() scored every past event with the duty's CURRENT effort_points, so
-- editing a live duty from 1 to 10 points retroactively multiplied the editor's earned credit and
-- bought them out of the rota. An append-only ledger is never re-priced.
-- Additive: one nullable column, backfilled, then made NOT NULL. Existing rows keep today's price,
-- which is the price they were scored at until now.

alter table public.chore_event add column points int;

update public.chore_event e
  set points = d.effort_points
  from public.duty d
  where d.id = e.duty_id and e.points is null;

alter table public.chore_event
  alter column points set not null,
  add constraint chore_event_points_check check (points between 1 and 10);

-- The price is the database's to set, never the client's: `grant insert` covers every column, so a
-- mate could otherwise post a 10-point row for a 1-point duty. A reversal takes its target's price
-- so it still nets out exactly, whatever the duty costs today.
create function private.set_chore_points() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.reverses_id is not null then
    select t.points into new.points from public.chore_event t where t.id = new.reverses_id;
  else
    select d.effort_points into new.points from public.duty d where d.id = new.duty_id;
  end if;
  return new;
end $$;

-- Fires before chore_reversal (triggers run in name order), which does not look at points.
create trigger chore_points before insert on public.chore_event
  for each row execute function private.set_chore_points();
