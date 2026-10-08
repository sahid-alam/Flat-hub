-- B5 Profile: a mate's own things — photo, cover, and per-trigger notification choices.
-- Additive only. The UPI ID is NOT moved: `member.upi_vpa` already exists and the `upi://pay`
-- link in src/app/(tabs)/index.tsx reads it. B5 only gives it a findable home on screen.

-- ---------------------------------------------------------------- member photos

-- Storage keys, not URLs: `<household_id>/<member_id>/avatar.jpg` in the private
-- `member-photos` bucket. Fixed paths, uploaded with upsert, so re-uploading leaves no orphan
-- behind to eat the free gigabyte.
alter table public.member
  add column avatar_path text check (length(avatar_path) between 1 and 300),
  add column cover_path text check (length(cover_path) between 1 and 300);

-- The kitty migration's grant is column-level, so a new column is unwritable until it is named.
grant update (avatar_path, cover_path) on public.member to authenticated;

-- ---------------------------------------------------------------- notification preferences

-- One row per (member, trigger) and ONLY when the member has chosen something other than the
-- default. An absent row means the default, which keeps the table empty for six people who never
-- open the screen.
--
-- HOW B9 READS THIS (do not change the table to send):
--
--   select mode from public.notification_pref
--    where household_id = $1 and member_id = $2 and trigger = $3;
--
--   -- no row  -> the trigger's default: 'sound'  for a trigger whose Channel in
--                 docs/NOTIFICATIONS.md is **push**, and 'silent' for **in-app** / **digest**.
--   -- 'sound'  -> send it, with sound where the platform allows one (Android). On iOS web push
--                 the phone's own notification settings decide the sound, not us.
--   -- 'silent' -> no interruption. On Android that is a push with showNotification's `silent`
--                 flag, which lands in the tray without a sound; Safari ignores that flag, so on
--                 an iPhone it is NOT posted at all and the trigger arrives only in the in-app
--                 list / the 19:00 digest. That is what src/app/profile/notifications.tsx
--                 promises the flat, and supabase/functions/notify/index.ts does it per device.
--   -- 'off'    -> do not deliver it at all.
--
-- The 22 trigger keys, their channel, their group and which ones are locked live in
-- src/domain/notifications.ts (TRIGGERS). That list is the single source of truth for the UI;
-- this table only records departures from it. The locked keys are repeated in the check
-- constraint below so a stale client cannot write a value B9 would then have to second-guess.
create table public.notification_pref (
  id uuid primary key, -- client-generated UUIDv7, like every other row
  household_id uuid not null references public.household (id),
  member_id uuid not null,
  -- Spelled out rather than pattern-matched, so a typo in B9's sender fails loudly instead of
  -- silently reading the default forever. src/domain/notifications.test.ts fails if the two lists
  -- ever drift apart.
  trigger text not null check (trigger in (
    'duty_due_today', 'duty_not_ticked', 'duty_partner_pending', 'duty_offered', 'duty_offer_claimed',
    'duty_offer_unclaimed', 'duty_vouched', 'meal_plan_due',
    'topup_not_in', 'reimbursed', 'month_ready_to_close', 'topup_recorded', 'kitty_low',
    'spend_reversed', 'month_closed',
    'lot_expiring', 'lot_expired', 'stock_below_min', 'import_needs_putaway', 'shopping_added',
    'mate_joined', 'marked_away')),
  mode text not null check (mode in ('sound', 'silent', 'off')),
  updated_at timestamptz not null default now(),
  unique (household_id, member_id, trigger), -- the upsert target
  foreign key (household_id, member_id) references public.member (household_id, id),
  -- The four that carry money or the core chore cannot be switched off. Per-trigger mutes are the
  -- real spam insurance, so everything else can go to 'off' — only these four stay reachable.
  check (mode <> 'off' or trigger not in
    ('duty_due_today', 'topup_not_in', 'reimbursed', 'month_ready_to_close'))
);
create index on public.notification_pref (household_id, member_id);

-- ---------------------------------------------------------------- RLS

alter table public.notification_pref enable row level security;

-- Readable by the household (a treasurer debugging "why didn't Ayan get it?" needs to see it), but
-- writable only by its owner: nobody else gets to mute your phone.
create policy notification_pref_read on public.notification_pref for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy notification_pref_insert on public.notification_pref for insert to authenticated
  with check (member_id in (select id from public.member where user_id = (select auth.uid())));
create policy notification_pref_update on public.notification_pref for update to authenticated
  using (member_id in (select id from public.member where user_id = (select auth.uid())))
  with check (member_id in (select id from public.member where user_id = (select auth.uid())));

revoke all on public.notification_pref from anon, authenticated;
grant select, insert on public.notification_pref to authenticated;
-- Only the choice itself is writable: a row keeps the id, member and trigger it was born with, so
-- the client writes a change as an insert and, on 23505, an update of these two columns. (A
-- PostgREST upsert would need table-level UPDATE, which hands over `id` as well.)
grant update (mode, updated_at) on public.notification_pref to authenticated;

-- ---------------------------------------------------------------- storage

-- Private: avatars and covers are never public URLs. Reads go through a signed URL, see
-- src/lib/photos.ts. Scoped by household_id as the first path segment; writes are pinned to the
-- caller's own member id as the second, so nobody can replace a flatmate's face.
-- Compression is client-side (src/lib/photos.ts) — the 1 MB limit here is a backstop, not the plan:
-- a ~200KB avatar means six people fill the free gigabyte in four years rather than four months.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('member-photos', 'member-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

-- Casting the path segment to uuid would throw on a stray folder name, so compare member's ids as
-- text instead and let a malformed path simply match nothing.
create policy member_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'member-photos'
    and exists (
      select 1 from public.member m
      where m.user_id = (select auth.uid())
        and m.household_id::text = (storage.foldername(name))[1]
    )
  );

-- upsert on a fixed path is an UPDATE when the object already exists, so both are needed.
create policy member_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'member-photos'
    and exists (
      select 1 from public.member m
      where m.user_id = (select auth.uid())
        and m.household_id::text = (storage.foldername(name))[1]
        and m.id::text = (storage.foldername(name))[2]
    )
  );
create policy member_photos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'member-photos'
    and exists (
      select 1 from public.member m
      where m.user_id = (select auth.uid())
        and m.household_id::text = (storage.foldername(name))[1]
        and m.id::text = (storage.foldername(name))[2]
    )
  );
create policy member_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'member-photos'
    and exists (
      select 1 from public.member m
      where m.user_id = (select auth.uid())
        and m.household_id::text = (storage.foldername(name))[1]
        and m.id::text = (storage.foldername(name))[2]
    )
  );
