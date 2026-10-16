-- FlatHub's local development seed: Flat 4B and the six mates who live in it.
--
-- LOCAL ONLY. `supabase db reset` runs this file (supabase/config.toml § db.seed) against the
-- stack on 127.0.0.1. It must never be pointed at the hosted project: it writes auth users with
-- a known password and it deletes nothing, so running it anywhere real would be a mess.
--
-- WHY THIS FILE IS IN THE REPO. The seed used to live in /tmp. /tmp was cleaned, two of its three
-- files went with it, and the next person to need a working database had to rebuild it out of a
-- pg_dump. A seed that only exists on one laptop is not a seed.
--
-- THE FLAT IS SIX REAL PEOPLE: Sahid, Ansh, Adnan, Anant, Ayan and Jatin, with Ansh holding the
-- kitty. Every name on every screen is one of those six. Invented flatmates in a screenshot are
-- how an app starts feeling like somebody else's.
--
-- Sign in as any of them: <first-name>, password `flathub-dev`.
--
-- The rows below are a dump of a hand-built flat, so they are long and dull to read; what matters
-- is the shape they make on screen, and the § THE DAY IT IS block at the bottom, which slides
-- every date forward so the fridge is always expiring and the rota is always mid-cycle.

-- Triggers off while the data lands: these rows ALREADY carry what the triggers would compute
-- (chore_event.points is snapshotted, the claim below already has its offer), and replaying a
-- dump must reproduce it rather than derive it a second time. It also makes insert order a
-- non-issue, which a 20-table dump otherwise is.
set session_replication_role = replica;

-- ---------------------------------------------------------------- the six, as auth users
-- Local passwords, deliberately all the same and deliberately weak. crypt() comes from pgcrypto,
-- which the kitty migration already installs into `extensions`.
-- The empty strings are not decoration: GoTrue scans confirmation_token and its five siblings
-- into a Go string, and a NULL there fails every sign-in with "Database error querying schema".
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email,
       extensions.crypt('flathub-dev', extensions.gen_salt('bf')), now(), now(), now(),
       '{"provider":"email","providers":["email"]}', '{}', false, false,
       '', '', '', '', '', '', '', ''
from (values
  ('019a0f00-0000-7000-8000-000000000001'::uuid, 'sahid@flathub.test'),
  ('019a0f00-0000-7000-8000-000000000002'::uuid, 'ansh@flathub.test'),
  ('019a0f00-0000-7000-8000-000000000003'::uuid, 'ayan@flathub.test'),
  ('019a0f00-0000-7000-8000-000000000004'::uuid, 'jatin@flathub.test'),
  ('019a0f00-0000-7000-8000-000000000005'::uuid, 'anant@flathub.test'),
  ('019a0f00-0000-7000-8000-000000000006'::uuid, 'adnan@flathub.test')
) as u(id, email)
on conflict (id) do nothing;

-- GoTrue will not sign anybody in without the matching identity row.
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id, u.id::text, 'email',
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
on conflict (id) do nothing;

--
--

--
-- Data for Name: household; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.household (id, name, currency, pool_holder_id, monthly_topup_paise, invite_code, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', 'Flat 4B', 'INR', '019a0001-0000-7000-8000-000000000001', 200000, '3c3966ff4b66', '2026-10-06 21:06:30.989673+00');

--
-- Data for Name: member; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000002', 'Ansh Rastogi', 'ansh@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);
INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000001', 'Sahid Alam', 'sahid@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);
INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000006', 'Adnan Qureshi', 'adnan@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);
INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000005', 'Anant Joshi', 'anant@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);
INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000003', 'Ayan Sheikh', 'ayan@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);
INSERT INTO public.member (id, household_id, user_id, display_name, upi_vpa, joined_on, left_on, created_at, avatar_path, cover_path) VALUES ('019a0001-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0f00-0000-7000-8000-000000000004', 'Jatin Rawat', 'jatin@upi', '2026-06-01', NULL, '2026-10-06 21:06:30.989673+00', NULL, NULL);

--
-- Data for Name: bill; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.bill (id, household_id, label, total_paise, paid_by, occurred_on, created_at) VALUES ('01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0000-0000-7000-8000-00000000000f', 'Wi-Fi', 60000, '019a0001-0000-7000-8000-000000000002', '2026-10-08', '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill (id, household_id, label, total_paise, paid_by, occurred_on, created_at) VALUES ('019a0007-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', 'Electricity', 100000, '019a0001-0000-7000-8000-000000000001', '2026-10-03', '2026-10-08 14:34:07.925231+00');

--
-- Data for Name: bill_share; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-79b0-8894-153509a6431b', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000001', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-7f0a-a829-25d2480a91ca', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000002', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-71a6-a5e0-395028e869a3', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000003', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-7168-8c78-4ff65e483727', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000004', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-7e3a-9f45-a345d599389d', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000005', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('01a11bef-227c-7f13-bfa4-354ce9914ac1', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000006', 10000, '2026-10-08 14:33:39.33509+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000001', 16667, '2026-10-08 14:34:07.929192+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000002', 16667, '2026-10-08 14:34:07.929192+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000003', 16667, '2026-10-08 14:34:07.929192+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000004', 16667, '2026-10-08 14:34:07.929192+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000005', 16666, '2026-10-08 14:34:07.929192+00');
INSERT INTO public.bill_share (id, household_id, bill_id, member_id, paise, created_at) VALUES ('019a0008-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000006', 16666, '2026-10-08 14:34:07.929192+00');

--
-- Data for Name: bill_payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.bill_payment (id, household_id, bill_id, member_id, paise, occurred_at, note, reverses_id, created_at) VALUES ('019a0009-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0007-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000005', 16666, '2026-10-08 14:34:07.932253+00', NULL, NULL, '2026-10-08 14:34:07.932253+00');
INSERT INTO public.bill_payment (id, household_id, bill_id, member_id, paise, occurred_at, note, reverses_id, created_at) VALUES ('01a11bf0-8892-709d-a38e-0039ae5d15a9', '019a0000-0000-7000-8000-00000000000f', '01a11bee-4b32-7696-9671-0e577b98f2f2', '019a0001-0000-7000-8000-000000000001', 10000, '2026-10-08 14:35:10.931589+00', NULL, NULL, '2026-10-08 14:35:10.931589+00');

--
-- Data for Name: duty; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', 'Kitchen floor', 3, NULL, '{0,3}', 'rolling', NULL, true, '2026-09-14 03:30:00+00', false, 1, NULL);
INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', 'Bins out', 1, NULL, '{1,4}', 'rolling', NULL, true, '2026-09-14 03:30:00+00', false, 1, NULL);
INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', 'Bathroom deep clean', 5, 10, NULL, 'rolling', NULL, true, '2026-09-14 03:30:00+00', false, 1, NULL);
INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', 'Water filter change', 2, 7, NULL, 'fixed', '019a0001-0000-7000-8000-000000000001', true, '2026-09-14 03:30:00+00', false, 1, NULL);
INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', 'Dishes rota', 2, 1, NULL, 'rolling', NULL, true, '2026-09-14 03:30:00+00', true, 2, NULL);
INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster) VALUES ('019a0006-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', 'Water can refill', 1, 1, NULL, 'rolling', NULL, true, '2026-09-14 00:30:00+00', false, 1, '{019a0001-0000-7000-8000-000000000004}');

--
-- Data for Name: chore_event; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000001', 'done', NULL, '2026-09-14', '2026-09-14 16:00:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000005', '019a0001-0000-7000-8000-000000000001', 'done', NULL, '2026-09-14', '2026-09-14 05:30:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000003', '019a0001-0000-7000-8000-000000000006', 'done', NULL, '2026-09-14', '2026-09-14 02:40:00+00', NULL, '2026-10-06 21:06:31.065565+00', 1);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000002', 'done', NULL, '2026-09-15', '2026-09-15 16:35:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000002', '019a0001-0000-7000-8000-000000000004', 'done', NULL, '2026-09-16', '2026-09-16 14:10:00+00', NULL, '2026-10-06 21:06:31.065565+00', 3);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000003', 'done', NULL, '2026-09-17', '2026-09-17 15:45:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000007', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000002', 'done', NULL, '2026-09-20', '2026-09-20 17:10:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000008', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000002', 'done', NULL, '2026-09-20', '2026-09-21 02:20:00+00', '019a0007-0000-7000-8000-000000000007', '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000009', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000005', '019a0001-0000-7000-8000-000000000001', 'done', NULL, '2026-09-21', '2026-09-21 05:00:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000a', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000006', 'done', NULL, '2026-09-22', '2026-09-22 15:30:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000b', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000004', '019a0001-0000-7000-8000-000000000002', 'done', NULL, '2026-09-24', '2026-09-24 12:50:00+00', NULL, '2026-10-06 21:06:31.065565+00', 5);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000c', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000005', 'skipped', NULL, '2026-09-25', '2026-09-25 17:40:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000d', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000002', '019a0001-0000-7000-8000-000000000004', 'swapped', '019a0001-0000-7000-8000-000000000003', '2026-09-27', '2026-09-27 03:45:00+00', NULL, '2026-10-06 21:06:31.065565+00', 3);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000e', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000002', '019a0001-0000-7000-8000-000000000003', 'done', NULL, '2026-09-27', '2026-09-27 12:15:00+00', NULL, '2026-10-06 21:06:31.065565+00', 3);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-00000000000f', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000005', '019a0001-0000-7000-8000-000000000001', 'done', NULL, '2026-09-28', '2026-09-28 04:35:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000010', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000005', 'skipped', NULL, '2026-09-30', '2026-09-30 18:00:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000011', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000003', '019a0001-0000-7000-8000-000000000006', 'done', NULL, '2026-10-01', '2026-10-01 02:30:00+00', NULL, '2026-10-06 21:06:31.065565+00', 1);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000012', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000006', 'done', NULL, '2026-10-02', '2026-10-02 15:50:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('019a0007-0000-7000-8000-000000000013', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000003', 'done', NULL, '2026-10-03', '2026-10-03 15:20:00+00', NULL, '2026-10-06 21:06:31.065565+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('4f06c64e-012c-430d-9bbd-57cacaf41fc3', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000006', 'swapped', '019a0001-0000-7000-8000-000000000002', '2026-10-09', '2026-10-08 22:29:00.194636+00', NULL, '2026-10-08 22:29:00.194636+00', 2);
INSERT INTO public.chore_event (id, household_id, duty_id, member_id, outcome, to_member_id, due_on, occurred_at, reverses_id, created_at, points) VALUES ('6f69b4e2-e5f2-47b2-9441-8237ee9b32d0', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '019a0001-0000-7000-8000-000000000005', 'done', NULL, '2026-10-09', '2026-10-08 22:29:00.194636+00', NULL, '2026-10-08 22:29:00.194636+00', 2);

--
-- Data for Name: duty_mark; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id, created_at) VALUES ('b8b0b165-7dec-4b11-b66c-680adb0390ca', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000006', '2026-10-09', '019a0001-0000-7000-8000-000000000004', 'offer', '019a0001-0000-7000-8000-000000000004', '2026-10-08 22:29:00.194636+00');
INSERT INTO public.duty_mark (id, household_id, duty_id, due_on, member_id, kind, by_member_id, created_at) VALUES ('0f767c26-a13f-453c-a853-f6322308baea', '019a0000-0000-7000-8000-00000000000f', '019a0006-0000-7000-8000-000000000001', '2026-10-09', '019a0001-0000-7000-8000-000000000006', 'offer', '019a0001-0000-7000-8000-000000000006', '2026-10-08 22:29:00.194636+00');

--
-- Data for Name: duty_photo; Type: TABLE DATA; Schema: public; Owner: postgres
--

--
-- Data for Name: product; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000007', '019a0000-0000-7000-8000-00000000000f', 'Lays', '{}', 'pc', true, NULL, false, NULL, 'Snacks', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', 'Milk', '{}', 'ml', true, 1000.000, true, 6000, 'Dairy', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', 'Paneer', '{}', 'g', true, 200.000, false, 19000, 'Dairy', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', 'Tomatoes', '{}', 'g', true, 500.000, true, 4000, 'Vegetables', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', 'Onions', '{}', 'g', true, 1000.000, true, 5000, 'Vegetables', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', 'Atta', '{}', 'g', true, 2000.000, true, 32000, 'Staples', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', 'Rice', '{}', 'g', true, 5000.000, true, 33000, 'Staples', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000008', '019a0000-0000-7000-8000-00000000000f', 'Dish soap', '{}', 'pc', true, 1.000, false, 12000, 'Household', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('019a0002-0000-7000-8000-000000000009', '019a0000-0000-7000-8000-00000000000f', 'Bananas', '{}', 'pc', true, NULL, false, 8000, 'Fruit', '2026-10-06 21:06:30.989673+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('01a11bf5-fb8b-7313-b38f-ba523d652353', '019a0000-0000-7000-8000-00000000000f', 'Surf Excel Easy Wash Detergent', '{}', 'pc', true, NULL, false, NULL, 'Household', '2026-10-08 14:41:44.809794+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('6e48684a-16c9-49f1-beee-a1009aafae67', '019a0000-0000-7000-8000-00000000000f', 'Amul Taaza milk', '{}', 'ml', true, 1000.000, true, 3000, 'Dairy', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('6898954b-9ce8-4807-b1ed-83261a21ac74', '019a0000-0000-7000-8000-00000000000f', 'Amul dahi', '{}', 'g', true, 400.000, true, 3500, 'Dairy', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('f5afa57e-bec1-47b7-aca2-17121fb9973e', '019a0000-0000-7000-8000-00000000000f', 'Eggs', '{}', 'pc', true, 6.000, true, 4800, 'Eggs & Meat', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('8b9a4008-8629-42bb-9d9f-77753bf3a263', '019a0000-0000-7000-8000-00000000000f', 'Bread', '{}', 'pc', true, 1.000, true, 4500, 'Staples', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('58a40a02-09fb-4594-816f-5ea675a66fdc', '019a0000-0000-7000-8000-00000000000f', 'Toor dal', '{}', 'g', true, 1000.000, true, 18000, 'Staples', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('f529d730-ee22-4f39-9923-e5ee92ebd11a', '019a0000-0000-7000-8000-00000000000f', 'Cooking oil', '{}', 'ml', true, 1000.000, true, 16000, 'Staples', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('69c7544e-2d9e-4be4-99dd-820cc31e3bf8', '019a0000-0000-7000-8000-00000000000f', 'Sugar', '{}', 'g', true, 1000.000, false, 5000, 'Staples', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('4c2fe70b-cce8-46fd-8555-31e457ae4644', '019a0000-0000-7000-8000-00000000000f', 'Potatoes', '{}', 'g', true, 1000.000, true, 3500, 'Vegetables', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('2a53d02e-81da-4ffa-b846-30dc44a03161', '019a0000-0000-7000-8000-00000000000f', 'Chai patti', '{}', 'g', true, 250.000, true, 27000, 'Drinks', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('6808177f-8605-4db3-ac04-c10c12977884', '019a0000-0000-7000-8000-00000000000f', 'Water can', '{}', 'pc', true, 2.000, true, 4000, 'Drinks', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('0c9fbc7c-afbe-4527-a42b-352d9a71c009', '019a0000-0000-7000-8000-00000000000f', 'Maggi', '{}', 'pc', true, 4.000, false, 5600, 'Snacks', '2026-10-08 14:28:35.444194+00', NULL);
INSERT INTO public.product (id, household_id, name, aliases, base_unit, track_stock, min_qty, favourite, default_price_paise, category, created_at, barcode) VALUES ('55856a6d-dd0f-42dd-a9da-5cda3180b759', '019a0000-0000-7000-8000-00000000000f', 'Gas cylinder', '{}', 'pc', true, 1.000, true, 110500, 'Household', '2026-10-08 14:28:35.444194+00', NULL);

--
-- Data for Name: spend; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000001', 'pool', 145000, '2026-08-05 14:10:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', 'local', 'Sri Sai Supermarket', '019a0001-0000-7000-8000-000000000002', 'pool', 67000, '2026-08-12 05:35:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', 'local', 'More Megastore', '019a0001-0000-7000-8000-000000000003', 'personal', 42000, '2026-08-18 14:45:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000005', 'pool', 23000, '2026-08-22 17:00:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000005', 'pool', -23000, '2026-08-23 03:30:00+00', NULL, NULL, '019a0003-0000-7000-8000-000000000004', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000011', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000001', 'pool', 182000, '2026-09-04 12:50:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000012', '019a0000-0000-7000-8000-00000000000f', 'local', 'More Megastore', '019a0001-0000-7000-8000-000000000006', 'personal', 31000, '2026-09-09 07:30:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000013', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000001', 'pool', 56000, '2026-09-17 15:40:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000014', '019a0000-0000-7000-8000-00000000000f', 'local', 'Sri Sai Supermarket', '019a0001-0000-7000-8000-000000000002', 'pool', 38000, '2026-09-22 05:00:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000021', '019a0000-0000-7000-8000-00000000000f', 'zepto', 'Zepto', '019a0001-0000-7000-8000-000000000001', 'pool', 74000, '2026-10-02 13:30:00+00', NULL, NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('019a0003-0000-7000-8000-000000000022', '019a0000-0000-7000-8000-00000000000f', 'local', 'More Megastore', '019a0001-0000-7000-8000-000000000005', 'personal', 26000, '2026-10-05 13:00:00+00', NULL, NULL, NULL, '2026-10-06 21:06:31.15013+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('01a11be9-dabf-7fe3-851b-5dcbbf706f79', '019a0000-0000-7000-8000-00000000000f', 'blinkit', NULL, '019a0001-0000-7000-8000-000000000006', 'personal', 44199, '2026-10-03 06:30:00+00', NULL, '{"lines": [{"qty": 2, "kind": "item", "name": "Amul Taaza Toned Milk", "unit": "500 ml", "line_total_paise": 5400}, {"qty": 1, "kind": "item", "name": "Aashirvaad Whole Wheat Atta", "unit": "5 kg", "line_total_paise": 24500}, {"qty": 1, "kind": "item", "name": "Onion", "unit": "1 kg", "line_total_paise": 3900}, {"qty": 1, "kind": "item", "name": "Tomato Hybrid", "unit": "500 g", "line_total_paise": 2200}, {"qty": 1, "kind": "item", "name": "Mother Dairy Paneer", "unit": "200 g", "line_total_paise": 9000}, {"qty": 1, "kind": "item", "name": "Surf Excel Easy Wash Detergent", "unit": "1 kg", "line_total_paise": 13500}, {"qty": 1, "kind": "fee", "name": "Handling Fee", "unit": null, "line_total_paise": 1199}, {"qty": 1, "kind": "fee", "name": "Delivery Fee", "unit": null, "line_total_paise": 3000}, {"qty": 1, "kind": "discount", "name": "Coupon SAVE50", "unit": null, "line_total_paise": -5000}], "source": "blinkit", "store_name": "Blinkit", "occurred_on": "2026-10-03", "total_paise": 57699}', NULL, '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('01a11bf2-37ea-7e8a-a454-1b41b95c5843', '019a0000-0000-7000-8000-00000000000f', 'local', NULL, '019a0001-0000-7000-8000-000000000001', 'pool', 4000, '2026-10-08 14:37:08.462685+00', NULL, NULL, NULL, '2026-10-08 14:37:08.462685+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('01a11bf2-7a85-7f4a-be05-fc9e094134bd', '019a0000-0000-7000-8000-00000000000f', 'local', NULL, '019a0001-0000-7000-8000-000000000001', 'pool', 3000, '2026-10-08 14:37:38.571728+00', NULL, NULL, NULL, '2026-10-08 14:37:38.571728+00');
INSERT INTO public.spend (id, household_id, source, store_name, paid_by, paid_from, total_paise, occurred_at, receipt_path, extraction, reverses_id, created_at) VALUES ('01a11d5d-6ed7-7854-88a3-5d367b990640', '019a0000-0000-7000-8000-00000000000f', 'blinkit', NULL, '019a0001-0000-7000-8000-000000000002', 'pool', 57699, '2026-10-03 06:30:00+00', NULL, '{"lines": [{"qty": 2, "kind": "item", "name": "Amul Taaza Toned Milk", "unit": "500 ml", "line_total_paise": 5400}, {"qty": 1, "kind": "item", "name": "Aashirvaad Whole Wheat Atta", "unit": "5 kg", "line_total_paise": 24500}, {"qty": 1, "kind": "item", "name": "Onion", "unit": "1 kg", "line_total_paise": 3900}, {"qty": 1, "kind": "item", "name": "Tomato Hybrid", "unit": "500 g", "line_total_paise": 2200}, {"qty": 1, "kind": "item", "name": "Mother Dairy Paneer", "unit": "200 g", "line_total_paise": 9000}, {"qty": 1, "kind": "item", "name": "Surf Excel Easy Wash Detergent", "unit": "1 kg", "line_total_paise": 13500}, {"qty": 1, "kind": "fee", "name": "Handling Fee", "unit": null, "line_total_paise": 1199}, {"qty": 1, "kind": "fee", "name": "Delivery Fee", "unit": null, "line_total_paise": 3000}, {"qty": 1, "kind": "discount", "name": "Coupon SAVE50", "unit": null, "line_total_paise": -5000}], "source": "blinkit", "store_name": "Blinkit", "occurred_on": "2026-10-03", "total_paise": 57699}', NULL, '2026-10-08 21:14:28.825456+00');

--
-- Data for Name: spend_line; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11bf2-37ea-7505-9309-fb17e4b06613', '019a0000-0000-7000-8000-00000000000f', '01a11bf2-37ea-7e8a-a454-1b41b95c5843', '6808177f-8605-4db3-ac04-c10c12977884', 'Water can', 1.000, NULL, 4000, 'item', '2026-10-08 14:37:08.462685+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('dd814dae-eefb-47ce-9a3c-4f250652ca5e', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 2.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('62ab5b4a-1d1d-4090-ad65-0660f7005738', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', '019a0002-0000-7000-8000-000000000002', 'Amul Malai Paneer 200g', 1.000, 'pc', 9500, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('bbb8c445-4608-4c26-9128-eb9d8ce90ac5', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', '019a0002-0000-7000-8000-000000000003', 'Tomato Local', 1.000, 'kg', 4000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('6b07cbfc-1949-42a0-92bf-4a8c624b8d06', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', '019a0002-0000-7000-8000-000000000005', 'Aashirvaad Atta 5kg', 1.000, 'pc', 32000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('f69f36ec-e3a7-48d3-b8b4-224d4317e6e0', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', '019a0002-0000-7000-8000-000000000006', 'India Gate Basmati 10kg', 1.000, 'pc', 78000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('2931a3fc-a4bc-4a4e-a9da-58d529d39d87', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000001', NULL, 'Delivery and handling', 1.000, NULL, 9500, 'fee', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('7922095f-56a5-420e-9c92-55face8a8949', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000004', 'Onion', 1.000, 'kg', 5000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('61253a8a-e33b-43b6-82f5-46b05e852020', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000009', 'Banana Robusta', 12.000, 'pc', 8000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1e805e75-b000-4423-a940-84e50924e6cf', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000003', 'Tomato Local', 1.000, 'kg', 4000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('6178ca05-b6f8-4063-bada-170e4e9d9e74', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000007', 'Lays Magic Masala', 5.000, 'pc', 5000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('d6a3bb23-3261-427f-8a03-55bc519dc866', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000008', 'Vim Dishwash Gel 750ml', 1.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('b5791f7f-7b75-47fd-9d74-324577c223e2', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000002', '019a0002-0000-7000-8000-000000000006', 'Sona Masoori Rice 5kg', 1.000, 'pc', 33000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('7c10cd09-1f98-47f5-bcd4-caee28735efb', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000003', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 2.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('aed74b3d-cbe7-4cac-bb11-3d25a2ac6c1b', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000003', '019a0002-0000-7000-8000-000000000002', 'Amul Malai Paneer 200g', 1.000, 'pc', 9500, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('33389240-78ea-46df-8201-6925091620cc', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000003', '019a0002-0000-7000-8000-000000000004', 'Onion', 1.000, 'kg', 5000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('2b5648c3-79c4-4673-88e7-49e1668038d8', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000003', '019a0002-0000-7000-8000-000000000007', 'Lays party pack', 10.000, 'pc', 15500, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('7e9e96e4-f720-4067-8ffc-1566cb1607b0', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000004', '019a0002-0000-7000-8000-000000000007', 'Lays assorted 15 pack', 15.000, 'pc', 23000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1eaa36ec-77f4-4311-be56-59a8c9c2319a', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 4.000, 'pc', 24000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('f4387d1d-e3cb-4d84-9e5b-7ba525f2cf62', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000002', 'Amul Malai Paneer 400g', 1.000, 'pc', 19000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('498c5301-2fea-4fb1-b539-1034fcbb0f9d', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000003', 'Tomato Hybrid', 2.000, 'kg', 8000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('cd639113-8b4b-47ed-b00e-fad1d88c7ec1', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000004', 'Onion', 2.000, 'kg', 10000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('d15c3822-7c93-426f-b488-13172fb720d6', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000005', 'Aashirvaad Atta 5kg', 1.000, 'pc', 32000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('d2ac7f5b-7c94-4e7b-8dc1-825b393df750', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', '019a0002-0000-7000-8000-000000000006', 'India Gate Basmati 10kg', 1.000, 'pc', 78000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('d67c6b46-36cf-42a4-92ad-58033cb7141f', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000011', NULL, 'Delivery and handling', 1.000, NULL, 11000, 'fee', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('6a90d183-4065-49c6-b2e4-f6c858660aa7', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000012', '019a0002-0000-7000-8000-000000000002', 'Amul Malai Paneer 400g', 1.000, 'pc', 19000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('cf716fc4-a083-47c0-93a9-05a8b72d3eed', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000012', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 2.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('b2e5d5f2-9687-4128-b9b3-511d987558da', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 2.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('a003cdb7-ef84-45e7-8a56-9a06300c4cc5', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', '019a0002-0000-7000-8000-000000000009', 'Banana Robusta', 12.000, 'pc', 9000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1271e3d2-4867-4443-81b6-55b3138f81e5', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', '019a0002-0000-7000-8000-000000000007', 'Lays variety box', 20.000, 'pc', 25000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('b40f6897-9d74-4a87-9397-50dad8249bac', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', '019a0002-0000-7000-8000-000000000008', 'Vim Dishwash Gel 750ml', 1.000, 'pc', 9000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('0cd60f4e-d93c-4d9e-96a7-42f3a614010f', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', NULL, 'Delivery and handling', 1.000, NULL, 6000, 'fee', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1aa877a6-42b7-4a64-a278-076bea95426f', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000013', NULL, 'ZEPTOFIRST coupon', 1.000, NULL, -5000, 'discount', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('7910215f-4131-45c5-bc23-0fced2b1e418', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000014', '019a0002-0000-7000-8000-000000000004', 'Onion', 1.000, 'kg', 6000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('7a53552b-05fd-4c43-a71f-bfc0751d54c0', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000014', '019a0002-0000-7000-8000-000000000003', 'Tomato Local', 2.000, 'kg', 7000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('2c4fc514-1655-4186-af95-dc55fab1250d', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000014', '019a0002-0000-7000-8000-000000000009', 'Banana Elaichi', 12.000, 'pc', 10000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('24505c34-320f-49c2-87f1-6653cee1d433', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000014', '019a0002-0000-7000-8000-000000000006', 'Sona Masoori Rice 5kg', 1.000, 'pc', 15000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('ba10d935-2f30-4354-802b-3d4cdd2aeee9', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 2.000, 'pc', 12000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1dda7529-54c5-44da-a613-aeeb72fe4053', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', '019a0002-0000-7000-8000-000000000003', 'Tomato Hybrid', 2.000, 'kg', 8000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('516d7d9d-0e2b-4003-b15c-75bbde99b911', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', '019a0002-0000-7000-8000-000000000004', 'Onion', 1.000, 'kg', 7000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('2a642fd9-5dd9-4d50-b96b-6eb8d5b461c8', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', '019a0002-0000-7000-8000-000000000005', 'Aashirvaad Atta 5kg', 1.000, 'pc', 32000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('0ca8af04-cc6c-4859-8332-01b7e44e6bfb', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', '019a0002-0000-7000-8000-000000000007', 'Lays Magic Masala', 10.000, 'pc', 10000, 'item', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('9f18ae67-26e4-4ccb-9fb5-28fff322cddb', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000021', NULL, 'Delivery and handling', 1.000, NULL, 5000, 'fee', '2026-10-06 21:06:30.989673+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('35d6a65e-77b6-496b-8a29-570790327e73', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000022', '019a0002-0000-7000-8000-000000000001', 'Amul Taaza Milk 500ml', 1.000, 'pc', 12000, 'item', '2026-10-06 21:06:31.15013+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('1d7e3d7b-d232-424a-96b9-ef220fd74420', '019a0000-0000-7000-8000-00000000000f', '019a0003-0000-7000-8000-000000000022', '019a0002-0000-7000-8000-000000000002', 'Amul Malai Paneer 400g', 1.000, 'pc', 14000, 'item', '2026-10-06 21:06:31.15013+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11bf2-9e81-783b-8a36-f1175858a508', '019a0000-0000-7000-8000-00000000000f', '01a11bf2-7a85-7f4a-be05-fc9e094134bd', '6e48684a-16c9-49f1-beee-a1009aafae67', 'Amul Taaza milk', 1.000, NULL, 3000, 'item', '2026-10-08 14:37:38.571728+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac0-75d0-9750-313d7ab438a6', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Amul Taaza Toned Milk', 2.000, '500 ml', 5400, 'item', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-7fbf-b0af-d0cd804afbb8', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Aashirvaad Whole Wheat Atta', 1.000, '5 kg', 24500, 'item', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-7efd-9f1c-7e24f66ceecd', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Onion', 1.000, '1 kg', 3900, 'item', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-7841-b4ca-c28883cb128c', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Tomato Hybrid', 1.000, '500 g', 2200, 'item', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-79d6-8d63-ebb4ddcd692a', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Mother Dairy Paneer', 1.000, '200 g', 9000, 'item', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-7c02-994e-30d9329c4d18', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Handling Fee', 1.000, NULL, 1199, 'fee', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-766d-ba19-a41bff82ea72', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Delivery Fee', 1.000, NULL, 3000, 'fee', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11be9-dac1-7c49-a654-33bb52a57151', '019a0000-0000-7000-8000-00000000000f', '01a11be9-dabf-7fe3-851b-5dcbbf706f79', NULL, 'Coupon SAVE50', 1.000, NULL, -5000, 'discount', '2026-10-08 14:29:16.550403+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed8-7b47-adcf-b047e372bc28', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', '6e48684a-16c9-49f1-beee-a1009aafae67', 'Amul Taaza Toned Milk', 2.000, '500 ml', 5400, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed8-76bb-922d-3a9df267c5fe', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Aashirvaad Whole Wheat Atta', 1.000, '5 kg', 24500, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7476-8dfd-49a251464baa', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Onion', 1.000, '1 kg', 3900, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-766f-ad3d-6362c373c4d1', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Tomato Hybrid', 1.000, '500 g', 2200, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7c4c-baba-0e5a4e559de4', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Mother Dairy Paneer', 1.000, '200 g', 9000, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7794-a135-5f544d03b30f', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', '01a11bf5-fb8b-7313-b38f-ba523d652353', 'Surf Excel Easy Wash Detergent', 1.000, '1 kg', 13500, 'item', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7918-9e7d-c4b556766c5c', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Handling Fee', 1.000, NULL, 1199, 'fee', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7a4f-aaf0-136b46e4557d', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Delivery Fee', 1.000, NULL, 3000, 'fee', '2026-10-08 21:14:28.825456+00');
INSERT INTO public.spend_line (id, household_id, spend_id, product_id, name, qty, unit, line_total_paise, kind, created_at) VALUES ('01a11d5d-6ed9-7717-911f-cb057670da1b', '019a0000-0000-7000-8000-00000000000f', '01a11d5d-6ed7-7854-88a3-5d367b990640', NULL, 'Coupon SAVE50', 1.000, NULL, -5000, 'discount', '2026-10-08 21:14:28.825456+00');

--
-- Data for Name: lot; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('01a11bf2-c9ac-7164-a7ab-f98baa119506', '019a0000-0000-7000-8000-00000000000f', '6e48684a-16c9-49f1-beee-a1009aafae67', '01a11bf2-9e81-783b-8a36-f1175858a508', 'fridge', NULL, false, '2026-10-08 14:38:02.00239+00', '2026-10-08 14:38:02.00239+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000004', '516d7d9d-0e2b-4003-b15c-75bbde99b911', 'pantry', NULL, false, '2026-10-02 14:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000001', 'ba10d935-2f30-4354-802b-3d4cdd2aeee9', 'fridge', '2026-10-07', true, '2026-10-02 14:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000002', '6a90d183-4065-49c6-b2e4-f6c858660aa7', 'fridge', '2026-10-09', false, '2026-09-09 08:00:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000003', '1dda7529-54c5-44da-a613-aeeb72fe4053', 'fridge', '2026-10-08', true, '2026-10-02 14:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000009', NULL, 'pantry', '2026-10-11', false, '2026-10-01 12:30:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000005', '2a642fd9-5dd9-4d50-b96b-6eb8d5b461c8', 'pantry', '2027-04-02', true, '2026-10-02 14:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000007', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000006', 'd2ac7f5b-7c94-4e7b-8dc1-825b393df750', 'pantry', '2027-07-02', true, '2026-09-04 13:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000008', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000002', 'f4387d1d-e3cb-4d84-9e5b-7ba525f2cf62', 'fridge', '2026-10-04', false, '2026-09-04 13:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-000000000009', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000001', 'b2e5d5f2-9687-4128-b9b3-511d987558da', 'freezer', '2027-01-02', false, '2026-09-17 16:00:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('019a0008-0000-7000-8000-00000000000a', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000007', '0ca8af04-cc6c-4859-8332-01b7e44e6bfb', 'pantry', '2026-11-22', true, '2026-10-02 14:10:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('01a11d5e-1a8a-7a6a-9fe4-b843c8db2701', '019a0000-0000-7000-8000-00000000000f', '6e48684a-16c9-49f1-beee-a1009aafae67', '01a11d5d-6ed8-7b47-adcf-b047e372bc28', 'fridge', NULL, false, '2026-10-08 21:14:40.460913+00', '2026-10-08 21:14:40.460913+00');
INSERT INTO public.lot (id, household_id, product_id, spend_line_id, location, expiry_date, opened, received_at, created_at) VALUES ('01a11d5e-1a8a-718d-bfad-b9c57fe6c346', '019a0000-0000-7000-8000-00000000000f', '01a11bf5-fb8b-7313-b38f-ba523d652353', '01a11d5d-6ed9-7794-a135-5f544d03b30f', 'pantry', NULL, false, '2026-10-08 21:14:40.460913+00', '2026-10-08 21:14:40.460913+00');

--
-- Data for Name: meal_plan; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.meal_plan (id, household_id, date, meal, text, by, written_at) VALUES ('01a11c1b-d169-753f-afba-43497cb8c021', '019a0000-0000-7000-8000-00000000000f', '2026-10-08', 'lunch', 'Rajma chawal', '019a0001-0000-7000-8000-000000000005', '2026-10-08 15:22:45.965+00');

--
-- Data for Name: member_absence; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.member_absence (id, household_id, member_id, from_date, to_date, created_at) VALUES ('019a0005-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0001-0000-7000-8000-000000000004', '2026-08-10', '2026-08-16', '2026-08-08 15:30:00+00');
INSERT INTO public.member_absence (id, household_id, member_id, from_date, to_date, created_at) VALUES ('019a0005-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0001-0000-7000-8000-000000000002', '2026-09-10', '2026-09-14', '2026-09-12 02:50:00+00');
INSERT INTO public.member_absence (id, household_id, member_id, from_date, to_date, created_at) VALUES ('019a0005-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0001-0000-7000-8000-000000000005', '2026-10-01', '2026-10-02', '2026-09-29 13:30:00+00');
INSERT INTO public.member_absence (id, household_id, member_id, from_date, to_date, created_at) VALUES ('019a0005-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0001-0000-7000-8000-000000000004', '2026-10-03', '2026-10-08', '2026-10-01 03:00:00+00');

--
-- Data for Name: month_close; Type: TABLE DATA; Schema: public; Owner: postgres
--

--
-- Data for Name: notification_pref; Type: TABLE DATA; Schema: public; Owner: postgres
--

--
-- Data for Name: notification_send; Type: TABLE DATA; Schema: public; Owner: postgres
--

--
-- Data for Name: pool_entry; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000101', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000001', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000102', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000002', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000103', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000003', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000104', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000004', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000105', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000005', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000106', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000006', 200000, '2026-08-02 04:30:00+00', 'August kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000201', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000001', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000202', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000002', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000203', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000003', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000204', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000004', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000205', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000005', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000206', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000006', 200000, '2026-09-01 04:00:00+00', 'September kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000301', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000001', 200000, '2026-10-01 03:45:00+00', 'October kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000302', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000002', 200000, '2026-10-01 03:45:00+00', 'October kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000303', '019a0000-0000-7000-8000-00000000000f', 'contribution', '019a0001-0000-7000-8000-000000000003', 200000, '2026-10-01 03:45:00+00', 'October kitty', NULL, NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000401', '019a0000-0000-7000-8000-00000000000f', 'reimbursement', '019a0001-0000-7000-8000-000000000003', 42000, '2026-08-20 12:30:00+00', 'UPI to Adnan', '019a0003-0000-7000-8000-000000000003', NULL, '2026-10-06 21:06:30.989673+00');
INSERT INTO public.pool_entry (id, household_id, kind, member_id, amount_paise, occurred_at, note, spend_id, reverses_id, created_at) VALUES ('019a0004-0000-7000-8000-000000000402', '019a0000-0000-7000-8000-00000000000f', 'reimbursement', '019a0001-0000-7000-8000-000000000006', 31000, '2026-09-11 14:15:00+00', 'UPI to Ayan', '019a0003-0000-7000-8000-000000000012', NULL, '2026-10-06 21:06:30.989673+00');

--
-- Data for Name: product_uom; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000001', 'pc', 500.0000, '2026-10-06 21:06:31.10721+00');
INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000002', 'pc', 200.0000, '2026-10-06 21:06:31.10721+00');
INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000003', 'kg', 1000.0000, '2026-10-06 21:06:31.10721+00');
INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000004', 'kg', 1000.0000, '2026-10-06 21:06:31.10721+00');
INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000005', 'pc', 5000.0000, '2026-10-06 21:06:31.10721+00');
INSERT INTO public.product_uom (household_id, product_id, unit, factor_to_base, created_at) VALUES ('019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000006', 'pc', 5000.0000, '2026-10-06 21:06:31.10721+00');

--
-- Data for Name: push_subscription; Type: TABLE DATA; Schema: public; Owner: postgres
--

--
-- Data for Name: shopping_item; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.shopping_item (id, household_id, product_id, name, added_by, done_by_spend_line_id, done_at, created_at) VALUES ('019a000a-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000004', 'Onions', '019a0001-0000-7000-8000-000000000006', '516d7d9d-0e2b-4003-b15c-75bbde99b911', '2026-10-02 13:40:00+00', '2026-10-01 04:30:00+00');
INSERT INTO public.shopping_item (id, household_id, product_id, name, added_by, done_by_spend_line_id, done_at, created_at) VALUES ('01a1130c-2b2b-7f86-b621-a95756f85442', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000008', 'Dish soap', '019a0001-0000-7000-8000-000000000001', NULL, '2026-10-06 21:08:47.019+00', '2026-10-06 21:08:47.05955+00');
INSERT INTO public.shopping_item (id, household_id, product_id, name, added_by, done_by_spend_line_id, done_at, created_at) VALUES ('019a000a-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0002-0000-7000-8000-000000000002', 'Paneer', '019a0001-0000-7000-8000-000000000002', NULL, '2026-10-06 21:08:56.722+00', '2026-10-03 03:50:00+00');
INSERT INTO public.shopping_item (id, household_id, product_id, name, added_by, done_by_spend_line_id, done_at, created_at) VALUES ('019a000a-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', NULL, 'Coriander', '019a0001-0000-7000-8000-000000000003', NULL, NULL, '2026-10-03 13:30:00+00');
INSERT INTO public.shopping_item (id, household_id, product_id, name, added_by, done_by_spend_line_id, done_at, created_at) VALUES ('019a000a-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', NULL, 'Curd — big pack', '019a0001-0000-7000-8000-000000000005', NULL, NULL, '2026-10-04 02:35:00+00');

--
-- Data for Name: stock_move; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000001', 1000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-02 14:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000002', 400.000, 'purchase', '019a0001-0000-7000-8000-000000000006', '2026-09-09 08:05:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000003', 2000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-02 14:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000004', 12.000, 'purchase', '019a0001-0000-7000-8000-000000000002', '2026-10-01 12:35:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000005', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000005', 1000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-02 14:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000006', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000006', 5000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-02 14:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000007', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000007', 10000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-09-04 13:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000008', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000008', 400.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-09-04 13:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000009', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000009', 500.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-09-17 16:05:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-00000000000a', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-00000000000a', 10.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-02 14:15:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000011', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000001', -500.000, 'consume', '019a0001-0000-7000-8000-000000000003', '2026-10-03 03:00:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000012', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000003', -900.000, 'consume', '019a0001-0000-7000-8000-000000000002', '2026-10-03 07:40:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000013', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000006', -1500.000, 'consume', '019a0001-0000-7000-8000-000000000006', '2026-10-03 14:30:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000014', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000007', -4000.000, 'consume', '019a0001-0000-7000-8000-000000000003', '2026-09-28 14:30:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000015', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000004', -5.000, 'consume', '019a0001-0000-7000-8000-000000000005', '2026-10-03 03:30:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000017', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-000000000001', -300.000, 'consume', '019a0001-0000-7000-8000-000000000001', '2026-10-04 02:45:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('019a0009-0000-7000-8000-000000000016', '019a0000-0000-7000-8000-00000000000f', '019a0008-0000-7000-8000-00000000000a', -10.000, 'consume', '019a0001-0000-7000-8000-000000000004', '2026-10-03 17:30:00+00', '2026-10-06 21:06:31.10721+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('01a11bf2-c9ac-7164-a7ab-f98baa119506', '019a0000-0000-7000-8000-00000000000f', '01a11bf2-c9ac-7164-a7ab-f98baa119506', 1000.000, 'purchase', '019a0001-0000-7000-8000-000000000001', '2026-10-08 14:38:02.00239+00', '2026-10-08 14:38:02.00239+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('01a11d5e-1a8a-7a6a-9fe4-b843c8db2701', '019a0000-0000-7000-8000-00000000000f', '01a11d5e-1a8a-7a6a-9fe4-b843c8db2701', 2000.000, 'purchase', '019a0001-0000-7000-8000-000000000002', '2026-10-08 21:14:40.460913+00', '2026-10-08 21:14:40.460913+00');
INSERT INTO public.stock_move (id, household_id, lot_id, delta_qty, reason, member_id, occurred_at, created_at) VALUES ('01a11d5e-1a8a-718d-bfad-b9c57fe6c346', '019a0000-0000-7000-8000-00000000000f', '01a11d5e-1a8a-718d-bfad-b9c57fe6c346', 1.000, 'purchase', '019a0001-0000-7000-8000-000000000002', '2026-10-08 21:14:40.460913+00', '2026-10-08 21:14:40.460913+00');

--
--

-- ---------------------------------------------------------------- § THE DAY IT IS
--
-- Areas and "comes with" (20261014175243). The migration backfills areas for flats that exist when
-- it runs; this flat is inserted after it, directly, so it gets its four here — fixed ids, so tests
-- and screenshots can name them. Then one real example of each feature:
--   * every duty gets an area, so the Duties tab groups;
--   * "Meal planning" is its own duty — 1 point, its own tick, carrying the plans_meals ROLE — and
--     comes with Dishes. Dishes is a pair, Meal planning is one person, so it goes to the first of
--     the pair. Dishes gives the role up: the dishes-holder is still the one asked, now through the
--     link, and gets a separate point for doing it.
INSERT INTO public.duty_area (id, household_id, name, position, created_at) VALUES
  ('019a000a-0000-7000-8000-000000000001', '019a0000-0000-7000-8000-00000000000f', 'Kitchen', 0, '2026-09-14 03:30:00+00'),
  ('019a000a-0000-7000-8000-000000000002', '019a0000-0000-7000-8000-00000000000f', 'Bathroom', 1, '2026-09-14 03:30:00+00'),
  ('019a000a-0000-7000-8000-000000000003', '019a0000-0000-7000-8000-00000000000f', 'Common areas', 2, '2026-09-14 03:30:00+00'),
  ('019a000a-0000-7000-8000-000000000004', '019a0000-0000-7000-8000-00000000000f', 'Outside', 3, '2026-09-14 03:30:00+00');

UPDATE public.duty SET area_id = '019a000a-0000-7000-8000-000000000001'
  WHERE id IN ('019a0006-0000-7000-8000-000000000001', '019a0006-0000-7000-8000-000000000002',
               '019a0006-0000-7000-8000-000000000005', '019a0006-0000-7000-8000-000000000006');
UPDATE public.duty SET area_id = '019a000a-0000-7000-8000-000000000002' WHERE id = '019a0006-0000-7000-8000-000000000004';
UPDATE public.duty SET area_id = '019a000a-0000-7000-8000-000000000004' WHERE id = '019a0006-0000-7000-8000-000000000003';
UPDATE public.duty SET plans_meals = false WHERE id = '019a0006-0000-7000-8000-000000000001';

INSERT INTO public.duty (id, household_id, name, effort_points, every_days, weekdays, schedule, fixed_member_id, active, created_at, plans_meals, group_size, roster, area_id, follows_id)
  VALUES ('019a0006-0000-7000-8000-000000000007', '019a0000-0000-7000-8000-00000000000f', 'Meal planning', 1, 1, NULL, 'rolling', NULL, true, '2026-09-14 03:30:00+00', true, 1, NULL,
          '019a000a-0000-7000-8000-000000000001', '019a0006-0000-7000-8000-000000000001');

-- Turn rules (20261017120000). The trigger that writes them is off under replica mode, so the seed
-- writes the first rule for each duty itself, exactly as the migration's backfill does on a real
-- flat: strict order with make-up turns, starting on the seed's "today", the list snapshotted in
-- display-name order where the duty has none of its own.
INSERT INTO public.duty_rule (household_id, duty_id, starts_on, turns, on_miss, roster,
                              every_days, weekdays, group_size, schedule, fixed_member_id, follows_id)
SELECT d.household_id, d.id, date '2026-10-09', d.turns, d.on_miss,
       coalesce(d.roster, (SELECT array_agg(m.id ORDER BY m.display_name, m.id) FROM public.member m
                           WHERE m.household_id = d.household_id AND m.left_on IS NULL)),
       d.every_days, d.weekdays, d.group_size, d.schedule, d.fixed_member_id, d.follows_id
FROM public.duty d;

-- Every date above was written on 2026-10-09 IST. Left alone they rot: the fridge fills with
-- things that expired months ago, "expiring soon" empties, and the rota's history stops touching
-- today. The last seed rotted exactly this way and a later one patched it with a one-off shift.
--
-- So shift the whole flat forward by however long ago that was, in one move. The spread the rows
-- describe — one lot already gone, three going inside the week, staples into next year, a duty
-- missed yesterday — is preserved; only its position on the calendar moves.
--
-- IST (Asia/Kolkata), the same boundary istDate() and the month-close guards use, so the seed
-- agrees with the app about which day it is.
do $$
declare
  drift interval = (((now() at time zone 'Asia/Kolkata')::date) - date '2026-10-09') * interval '1 day';
begin
  if drift = interval '0' then return; end if;

  -- money
  update public.spend        set occurred_at = occurred_at + drift;
  update public.spend_line   set created_at  = created_at  + drift;
  update public.pool_entry   set occurred_at = occurred_at + drift;
  update public.bill         set occurred_on = occurred_on + drift;
  update public.bill_payment set occurred_at = occurred_at + drift;

  -- the kitchen
  -- lot.opened is a boolean, not a timestamp, so it has no date to move.
  update public.lot           set received_at = received_at + drift,
                                  expiry_date = expiry_date + drift;
  update public.stock_move    set occurred_at = occurred_at + drift;
  update public.shopping_item set created_at  = created_at  + drift,
                                  done_at     = done_at     + drift;

  -- the rota. duty.created_at is its anchor, so it moves with everything else or the cadence
  -- lands on different weekdays than the history it is explaining.
  update public.duty        set created_at  = created_at  + drift;
  update public.duty_rule   set starts_on   = starts_on   + drift,
                                created_at  = created_at  + drift;
  update public.chore_event set due_on      = due_on      + drift,
                                occurred_at = occurred_at + drift,
                                created_at  = created_at  + drift;
  update public.duty_mark   set due_on      = due_on      + drift,
                                created_at  = created_at  + drift;
  update public.meal_plan   set date        = date        + drift;
  update public.member_absence set from_date = from_date + drift, to_date = to_date + drift;
end $$;

-- `member.joined_on` and `household` deliberately do NOT move: the flat started when it started,
-- and a joining date that chases today would make everyone a new arrival for ever.

set session_replication_role = origin;
