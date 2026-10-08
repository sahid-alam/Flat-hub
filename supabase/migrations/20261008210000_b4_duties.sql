-- B4 Duties (V3): two people on one duty the same day, offer → claim instead of swap-by-handover,
-- vouching, and photo evidence. Additive only.
--
-- What deliberately does NOT change:
--   * `chore_event`'s outcome CHECK still allows 'skipped'. The app stops writing skips — a duty past
--     its due date with nobody's Done is MISSED, computed from the schedule and never recorded — but
--     the rows already in the ledger stay valid and stay where they are. An append-only ledger is not
--     rewritten because the product changed its mind.
--   * `chore_event`'s shape. A co-assignee ticks their OWN row, so "only the assignee ticks" holds per
--     person and Missed is per person. A CLAIM is the existing 'swapped' row: member_id = the mate who
--     offered, to_member_id = the mate who took it. src/domain/duties.ts reads it exactly as before.

-- ---------------------------------------------------------------- duty: the co-assignment columns

alter table public.duty
  -- how many mates do this duty TOGETHER, on the same day. Not alternating owners.
  add column group_size int not null default 1 check (group_size between 1 and 3),
  -- whoever holds this duty also tells the cook what to make (V3_BRIEF R11). A role, never matched
  -- by the duty's name.
  add column plans_meals boolean not null default false,
  -- who's in, in rota order. null = every mate. No composite FK is possible into an array; a stale id
  -- simply never matches a member and src/domain/duties.ts ignores it, the same as a mate who left.
  add column roster uuid[];

comment on column public.duty.roster is
  'Who is in this duty, in rota order. Reordering is the tie-break between mates on equal deficit — '
  'it is "I can do Tuesday, not Monday", not a fixed timetable. null = every mate.';

-- ---------------------------------------------------------------- duty_mark: offers and vouches

-- An OFFER opens one slot of one instance: the row says "Ansh offered bins, due Thu 8 Oct", it is
-- visible to all six, and it hands the duty to NOBODY. Somebody must tap Take it, which appends the
-- 'swapped' chore_event. Unclaimed by the due date, the slot is missed like any other — an open offer
-- protects nobody.
-- A VOUCH is one mate confirming another's duty was done. It carries no points and never will.
create table public.duty_mark (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  duty_id uuid not null,
  due_on date not null,
  member_id uuid not null, -- whose slot of that instance
  kind text not null check (kind in ('offer', 'vouch')),
  by_member_id uuid not null, -- who made the mark
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, duty_id) references public.duty (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id),
  foreign key (household_id, by_member_id) references public.member (household_id, id),
  -- you offer your OWN slot (on a pair duty, your half, never both), and you vouch for someone else's
  check ((kind = 'offer') = (by_member_id = member_id)),
  -- one offer and one vouch per mate per slot; a second tap is the same row, so a retry is idempotent
  unique (household_id, duty_id, due_on, member_id, kind, by_member_id)
);
create index on public.duty_mark (household_id, due_on);
create index on public.duty_mark (duty_id);

-- ---------------------------------------------------------------- duty_photo

-- Keyed by the INSTANCE (duty_id, due_on, member_id), not by a chore_event: a duty nobody did has no
-- event to hang a photo on, and "didn't do it correctly" is a duty logged done but done badly. One
-- table covers both. Anyone can add one, including the mate who did the job. There is no report, no
-- flag and no red: this is a record, not a public shaming.
create table public.duty_photo (
  id uuid primary key,
  household_id uuid not null references public.household (id),
  duty_id uuid not null,
  due_on date not null,
  member_id uuid not null, -- whose instance the photo is of
  raised_by uuid not null, -- who photographed it
  path text not null check (length(path) between 1 and 400),
  note text check (length(btrim(note)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (household_id, id),
  foreign key (household_id, duty_id) references public.duty (household_id, id),
  foreign key (household_id, member_id) references public.member (household_id, id),
  foreign key (household_id, raised_by) references public.member (household_id, id)
);
create index on public.duty_photo (household_id, due_on);
create index on public.duty_photo (duty_id);

-- ---------------------------------------------------------------- nobody is given a duty

-- "Nobody is ever given a duty without tapping to take it." A 'swapped' row is a CLAIM, so it needs an
-- offer on that exact slot to answer. Without this, any mate could post a swap pointing at anyone and
-- dump a chore on them. Enforced here rather than in the CHECK, so the ledger's constraint is untouched.
-- A reversal is exempt: it mirrors a row that was already legitimate.
create function private.check_chore_claimable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.outcome = 'swapped' and new.reverses_id is null and not exists (
    select 1 from public.duty_mark m
    where m.household_id = new.household_id and m.kind = 'offer'
      and m.duty_id = new.duty_id and m.due_on = new.due_on and m.member_id = new.member_id
  ) then
    raise exception 'a duty can only be taken after it is offered' using errcode = '23514';
  end if;
  return new;
end $$;
-- Triggers fire in name order: chore_points (prices it) → chore_reversal → chore_zclaimable.
create trigger chore_zclaimable before insert on public.chore_event
  for each row execute function private.check_chore_claimable();

-- ---------------------------------------------------------------- RLS

alter table public.duty_mark enable row level security;
alter table public.duty_photo enable row level security;

create policy duty_mark_read on public.duty_mark for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy duty_mark_insert on public.duty_mark for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

create policy duty_photo_read on public.duty_photo for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy duty_photo_insert on public.duty_photo for insert to authenticated
  with check (household_id in (select private.my_household_ids()));

-- Immutable once submitted: you can swap the photo before you send it, nobody removes it after. No
-- UPDATE and no DELETE grant on either table, exactly like the ledgers.
revoke all on public.duty_mark, public.duty_photo from anon, authenticated;
grant select, insert on public.duty_mark, public.duty_photo to authenticated;
grant update (group_size, plans_meals, roster) on public.duty to authenticated;

-- ---------------------------------------------------------------- Storage

-- One private bucket, laid out as <household_id>/duty/<photo_id>.jpg, so the first path segment is the
-- tenant and member's own RLS does the scoping. Compression happens on upload in the client
-- (src/lib/photo.ts): a 3 MB iPhone photo is ~200 KB, and the free tier's 1 GB is shared with the
-- database's own quota story — see docs/PHOTOS_SCAN_AI.md § Photo storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('flathub', 'flathub', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

create policy "flathub members read their household's files" on storage.objects for select to authenticated
  using (
    bucket_id = 'flathub'
    and (storage.foldername(name))[1] in (select household_id::text from public.member)
  );
create policy "flathub members upload into their household" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'flathub'
    and (storage.foldername(name))[1] in (select household_id::text from public.member)
  );
-- No update and no delete policy: a submitted photo is immutable, like its row.

-- ---------------------------------------------------------------- retention: 2 months

-- RETENTION RULE: a duty photo is deleted after 2 months. It exists to settle "I did mop the kitchen"
-- that week, and nothing is served by keeping a picture of someone's floor for a year.
-- This function forgets the rows and RETURNS THE PATHS. It does not touch the bucket: whether deleting
-- a storage.objects row removes the backing object or orphans it is not something this migration can
-- verify on hosted Supabase, so the caller removes the files through Storage's own API with the paths
-- returned here. The scheduled job that calls it is B9's work, not this migration's.
create function private.purge_duty_photos(older_than interval default '2 months')
  returns setof text
language sql security definer set search_path = '' as $$
  delete from public.duty_photo where created_at < now() - older_than returning path;
$$;

comment on function private.purge_duty_photos is
  'B9: schedule daily. Deletes duty_photo rows older than 2 months and returns their storage paths, '
  'which the caller must then remove from the flathub bucket through Storage''s API.';
