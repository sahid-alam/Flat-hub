// Whose turn it is, and where everyone stands. Every action appends one row and nothing here ever
// updates or deletes one — Undo writes a reversal.
//
// THERE IS NO SKIP. A duty past its due date that nobody ticked is MISSED: computed from the
// schedule, never recorded, earning no credit. A missed row reads as a fact and nothing more — no
// clay, no warning glyph, no tally beside anyone's name.
// A SWAP IS AN OFFER. The assignee offers their slot, it stays open and visible to all six, and
// another mate taps Take it. Nobody is ever handed a duty. Unclaimed by the due date it is missed
// like any other: an open offer protects nobody. See docs/DATA_MODEL.md ("Duties").
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { away, leaderOf, missed, offered, standing, vouchers, type RotaRow, type Slot } from '@/domain/duties';
import { rota } from '@/domain/duties';
import { newId } from '@/lib/id';
import { pickPhoto, upload } from '@/lib/photo';
import { insertOnce, supabase } from '@/lib/supabase';
import { dayLabel, sayError, today } from '@/lib/util';
import { SwipeRow, cadenceLabel, useDuties } from '@/ui/duties';
import { Block, ErrorText, Icon, Pill, Rule, Screen, SectionLabel, T, TAB_BAR, Toast, usePalette } from '@/ui/kit';

const AHEAD = 4; // today plus the next three days: an offer has to work on a duty due on Thursday
const BACK = 1; // yesterday, so a missed duty is stated once and then left alone
const OFFER_ICON = { ios: 'arrow.up.circle', android: 'arrow_upward' };
const CAMERA = { ios: 'camera', android: 'photo_camera' };

const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const list = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

export default function Duties() {
  const c = usePalette();
  const { duties, members, absences, choreEvents, dutyMarks, dutyPhotos, household, me, name, reload, anchor, areas } =
    useDuties();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ card: string; message: string; undo?: () => void } | null>(null);
  // One id per pending action, kept until a reload confirms it: a retry after a lost response hits
  // insertOnce's 23505 path instead of appending a second event and paying the points twice.
  const pending = useRef(new Map<string, string>());

  // Tabs stay mounted and nothing refetches on its own, so without this a tab left open shows stale
  // rows: a duty another mate already ticked still reads open.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const now = today();
  const days = rota(duties, members, absences, choreEvents, shift(now, -BACK), AHEAD + BACK, anchor, now);
  const yesterday = days.filter((r) => r.date < now);
  const todays = days.filter((r) => r.date === now);
  const later = days.filter((r) => r.date > now);
  const stands = standing(duties, members, absences, choreEvents, anchor, now, anchor);
  const current = new Set(members.filter((m) => !m.left_on || m.left_on >= now).map((m) => m.id));
  const mates = stands
    .filter((s) => current.has(s.memberId))
    .map((s) => ({ ...s, name: name(s.memberId) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const open = (r: RotaRow) => r.slots.filter((s) => !s.done);
  // "Comes with" only binds on a day both are due; on any other day the follower is a duty like any other.
  const ledBy = (r: RotaRow) => {
    const lead = leaderOf(r.duty, duties);
    return lead && days.some((x) => x.duty.id === lead.id && x.date === r.date) ? lead : undefined;
  };
  /** What moves with this slot if it changes hands: the followers whose turn is inherited from its holder. */
  const carried = (r: RotaRow, slot: Slot) =>
    days
      .filter((x) => x.date === r.date && ledBy(x)?.id === r.duty.id && x.slots.some((s) => s.ownerId === slot.holderId))
      .map((x) => x.duty.name);
  const andCarried = (r: RotaRow, slot: Slot) => {
    const names = carried(r, slot);
    return names.length ? ` ${list(names)} ${names.length === 1 ? 'comes' : 'come'} with it.` : '';
  };
  // Today, by area, in the flat's own order. A follower sits in its leader's group, right under it —
  // rota() already places it there — so "Dishes, then Meal planning" never splits across two headings.
  const areaKey = (r: RotaRow) => (ledBy(r) ?? r.duty).area_id ?? null;
  const groups = [...areas.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null, name: 'Other' }]
    .map((g) => ({ ...g, rows: todays.filter((r) => areaKey(r) === g.id || (g.id === null && !areas.some((a) => a.id === areaKey(r)))) }))
    .filter((g) => g.rows.length > 0);
  const openToday = todays.flatMap(open);
  // Collapse the names: one mate's name once, not once per duty, and never your own name back at you.
  const first = (id: string) => (id === me.id ? 'you' : name(id).split(' ')[0]);
  const whoToday = [...new Set(openToday.map((s) => first(s.holderId)))];
  const digest = !todays.length
    ? 'No duties due today.'
    : !openToday.length
      ? 'All of today’s duties are done.'
      : whoToday.length === 1
        ? whoToday[0] === 'you'
          ? `${openToday.length} ${openToday.length === 1 ? 'turn' : 'turns'} left today, and ${openToday.length === 1 ? 'it is' : 'they are'} yours.`
          : `${openToday.length} ${openToday.length === 1 ? 'turn' : 'turns'} left today — all ${whoToday[0]}’s.`
        : `${openToday.length} turns left today — ${list(whoToday)}.`;

  // Whose next open turn falls when. Words, never a ranking.
  const upcoming = [...todays, ...later].flatMap((r) => open(r).map((s) => ({ ...s, date: r.date })));
  const nextUp = upcoming[0]?.holderId ?? null;
  const turnOn = new Map<string, string>();
  for (const s of upcoming) if (!turnOn.has(s.holderId)) turnOn.set(s.holderId, s.date);
  const mine = mates.find((m) => m.memberId === me.id);

  // Accent once per screen: the first open turn today that is yours gets the brass tick.
  const brass = todays.flatMap((r) => open(r).map((s) => `${r.duty.id}:${r.date}:${s.ownerId}`))
    .find((k) => k.endsWith(`:${me.id}`));

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setToast(null);
    try {
      await work();
      await reload();
    } catch (e) {
      setError(sayError(e));
    }
    setBusy(null);
  }

  /** Append one chore_event, idempotently, and offer an Undo that writes the mirroring reversal. */
  async function event(
    r: RotaRow,
    slot: Slot,
    outcome: 'done' | 'swapped',
    toMemberId: string | null,
    message: string,
  ) {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    const key = `${card}:${outcome}`;
    const id = pending.current.get(key) ?? newId();
    pending.current.set(key, id);
    // A claim is recorded against the mate who OFFERED the slot — that is the row the db's offer
    // check answers, and what tells the engine the offerer kept their place in the rotation.
    const row = {
      household_id: household.id,
      duty_id: r.duty.id,
      member_id: outcome === 'swapped' ? slot.ownerId : slot.holderId,
      outcome,
      to_member_id: toMemberId,
      due_on: r.date,
    };
    await run(key, async () => {
      await insertOnce('chore_event', { id, ...row });
      // The insert landed, so the id has done its job. The reload runs after this, so a reload that
      // fails leaves the id forgotten and a retry mints a new one — one extra row in the ledger,
      // never double points: donePoints settles per slot and the slot's key is the mate.
      pending.current.delete(key);
      setToast({
        card,
        message,
        // A mistake is corrected with a reversing row that mirrors the original, never a delete.
        undo: () => run(`${key}:undo`, async () => {
          await insertOnce('chore_event', { id: newId(), ...row, reverses_id: id });
          setToast(null);
        }),
      });
    });
  }

  /** An offer or a vouch. Neither is a ledger row and neither carries points, so neither undoes. */
  async function mark(r: RotaRow, slot: Slot, kind: 'offer' | 'vouch', message: string) {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    const key = `${card}:${kind}`;
    await run(key, async () => {
      await insertOnce('duty_mark', {
        id: newId(),
        household_id: household.id,
        duty_id: r.duty.id,
        due_on: r.date,
        member_id: slot.ownerId,
        kind,
        by_member_id: me.id,
      });
      // An offer can be taken back while nobody has taken it, so its toast offers the same Undo.
      setToast({ card, message, undo: kind === 'offer' ? () => withdraw(r, slot) : undefined });
    });
  }

  /** Take your own offer back. Refused once somebody has taken it (20261015120000_withdraw_offer). */
  async function withdraw(r: RotaRow, slot: Slot) {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    await run(`${card}:withdraw`, async () => {
      const { error: e } = await supabase.rpc('withdraw_offer', { p_duty: r.duty.id, p_due: r.date });
      if (e) throw e;
      setToast({ card, message: 'Taken back — it is your turn again.' });
    });
  }

  async function addPhoto(r: RotaRow, slot: Slot) {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    const uri = await pickPhoto();
    if (!uri) return;
    const id = newId();
    await run(`${card}:photo`, async () => {
      // Immutable once submitted: the row is inserted only after the file is up, and neither can be
      // edited or removed afterwards. Swap the photo before you send it.
      const path = await upload(household.id, `duty/${id}`, uri);
      await insertOnce('duty_photo', {
        id,
        household_id: household.id,
        duty_id: r.duty.id,
        due_on: r.date,
        member_id: slot.ownerId,
        raised_by: me.id,
        path,
      });
      setToast({ card, message: 'Photo added to the record.' });
    });
  }

  /** One co-assignee's half of one instance. */
  const slotRow = (r: RotaRow, slot: Slot, when: 'past' | 'today' | 'future') => {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    const yours = slot.holderId === me.id;
    const who = name(slot.holderId);
    const owner = name(slot.ownerId);
    const isMissed = missed(slot, r.date, now);
    // Somebody took it: the offer is spent, so the row stops advertising itself.
    const claimed = slot.holderId !== slot.ownerId;
    // Are you already on this instance, on some other half of it? Then this offer is not yours to
    // take. The database cannot check this — it would need the rota, which lives in TypeScript on
    // purpose (supabase/migrations/20261008220000_b9_notify.sql says why) — so the screen does.
    const onThisAlready = r.slots.some((o) => o.ownerId !== slot.ownerId && o.holderId === me.id);
    const isOffered = !claimed && !slot.done && offered(dutyMarks, r.duty.id, r.date, slot.ownerId);
    const vouched = vouchers(dutyMarks, r.duty.id, r.date, slot.ownerId);
    const photos = dutyPhotos.filter(
      (p) => p.duty_id === r.duty.id && p.due_on === r.date && p.member_id === slot.ownerId,
    );

    const tail = slot.done ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <T size={14} soft style={{ flex: 1 }}>
          {yours ? 'You did it' : `${who.split(' ')[0]} did it`}
          {vouched.length > 0 && ` · vouched by ${list(vouched.map(first))}`}
        </T>
        {/* A vouch is keyed to the slot's OWNER, so the mate who offered a slot cannot vouch for the
            mate who took it — the db refuses it. Hide the pill rather than show a tap that fails. */}
        {!yours && slot.ownerId !== me.id && !vouched.includes(me.id) && (
          <Chip
            label="Vouch"
            busy={busy === `${card}:vouch`}
            accessibilityLabel={`Vouch that ${who.split(' ')[0]} did ${r.duty.name}`}
            onPress={() => mark(r, slot, 'vouch', `Vouched for ${who.split(' ')[0]}.`)}
          />
        )}
      </View>
    ) : isMissed ? (
      // Grey, a single word, no icon, no colour. Nothing was written for it, and nothing is owed.
      <T size={14} soft style={{ flex: 1 }}>
        {yours ? 'Your turn' : `${who.split(' ')[0]}’s turn`} · Missed
      </T>
    ) : isOffered && !yours ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <T size={14} soft style={{ flex: 1 }}>
          {`${owner.split(' ')[0]} offered it · due ${dayLabel(r.date)}`}
          {andCarried(r, slot) && ` ·${andCarried(r, slot).replace(/\.$/, '')}`}
          {onThisAlready && ' · you are on this one too'}
        </T>
        {/* Not for a mate already holding the other half: there is no turn to hand over, and
            assignees() would refuse the claim anyway (a partner's claim sticks to nobody). Saying
            why beats a button that quietly does nothing. */}
        {!onThisAlready && (
          <Chip
            label="Take it"
            strong
            busy={busy === `${card}:swapped`}
            accessibilityLabel={`Take ${r.duty.name} from ${owner.split(' ')[0]}, due ${dayLabel(r.date)}`}
            onPress={() =>
              event(r, slot, 'swapped', me.id, `${r.duty.name} is yours — due ${dayLabel(r.date)}.${andCarried(r, slot)}`)
            }
          />
        )}
      </View>
    ) : (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <T size={14} weight={yours ? '700' : '500'} soft={!yours} style={{ flex: 1 }}>
          {claimed ? (yours ? 'Your turn now' : `${who.split(' ')[0]}’s turn now`) : yours ? 'Your turn' : `${who.split(' ')[0]}’s turn`}
          {claimed && ` · ${yours ? 'you' : who.split(' ')[0]} took it from ${owner.split(' ')[0]}`}
          {isOffered && ' · offered, waiting for somebody to take it'}
        </T>
        {yours && when !== 'future' && (
          <Chip
            label="Done"
            strong
            accent={card === brass}
            busy={busy === `${card}:done`}
            accessibilityLabel={`${r.duty.name} · mark done`}
            onPress={() => event(r, slot, 'done', null, `${r.duty.name} done`)}
          />
        )}
        {/* Yours, offered, and nobody has taken it yet (a taken slot is no longer the owner's to hold). */}
        {yours && isOffered && (
          <Chip
            label="Take back"
            busy={busy === `${card}:withdraw`}
            accessibilityLabel={`Take back your offer of ${r.duty.name}, due ${dayLabel(r.date)}`}
            onPress={() => withdraw(r, slot)}
          />
        )}
        {yours && !isOffered && (
          <Chip
            label="Offer"
            busy={busy === `${card}:offer`}
            accessibilityLabel={`Offer ${r.duty.name}, due ${dayLabel(r.date)}, to anyone who will take it`}
            onPress={() => mark(r, slot, 'offer', `Offered — it is open until somebody takes it.${andCarried(r, slot)}`)}
          />
        )}
      </View>
    );

    const body = (
      <View
        accessibilityLabel={`${r.duty.name}, ${yours ? 'your turn' : `${who}'s turn`}${slot.done ? ', done' : isMissed ? ', missed' : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, backgroundColor: c.surface }}>
        <Ring state={slot.done ? 'done' : isMissed ? 'missed' : isOffered ? 'offered' : yours ? 'yours' : 'theirs'} />
        <View style={{ flex: 1, gap: 2 }}>
          {r.duty.group_size > 1 && (
            <T size={15} weight="700">
              {yours ? 'You' : who.split(' ')[0]}
            </T>
          )}
          {tail}
        </View>
      </View>
    );

    return (
      <View key={card} style={{ gap: 6 }}>
        {/* Swipe is a shortcut, never the only route: the Offer chip above does the same thing. */}
        {yours && !slot.done && !isMissed && !isOffered ? (
          <SwipeRow
            label="Offer"
            icon={OFFER_ICON}
            onAction={() => mark(r, slot, 'offer', `Offered — it is open until somebody takes it.${andCarried(r, slot)}`)}>
            {body}
          </SwipeRow>
        ) : (
          body
        )}
        {photos.length > 0 && (
          <T size={13} soft>
            {`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} · added by ${list([
              ...new Set(photos.map((p) => name(p.raised_by).split(' ')[0])),
            ])}`}
          </T>
        )}
        {when !== 'future' && (
          <View style={{ flexDirection: 'row' }}>
            <Chip
              label="Add a photo"
              icon={CAMERA}
              busy={busy === `${card}:photo`}
              accessibilityLabel={`Add a photo to ${r.duty.name}, ${dayLabel(r.date)}`}
              onPress={() => addPhoto(r, slot)}
            />
          </View>
        )}
        {toast?.card === card && <Toast message={toast.message} onUndo={toast.undo} style={{ marginTop: 2 }} />}
      </View>
    );
  };

  /** One line in yesterday's record. Grey, one word, no glyph, and a way to add the photo. */
  const missedRow = (r: RotaRow, slot: Slot) => {
    const card = `${r.duty.id}:${r.date}:${slot.ownerId}`;
    const photos = dutyPhotos.filter(
      (p) => p.duty_id === r.duty.id && p.due_on === r.date && p.member_id === slot.ownerId,
    );
    return (
      <View key={card}>
        {/* The ROW is the control, in kit's list-row grammar with a trailing icon — five chunky
            pills down a record of what nobody did turns a fact into an accusation. ≥56pt, so it
            clears the 48pt target rule without raising its voice. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${r.duty.name}, ${first(slot.holderId) === 'you' ? 'your turn' : `${first(slot.holderId)}'s turn`}, missed. Add a photo`}
          disabled={busy === `${card}:photo`}
          onPress={() => addPhoto(r, slot)}
          style={({ pressed }) => [
            { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
            pressed && { opacity: 0.6 },
          ]}>
          <T size={15} weight="600" style={{ flex: 1 }}>
            {r.duty.name}
          </T>
          <T size={14} soft>
            {busy === `${card}:photo`
              ? 'Adding…'
              : `${first(slot.holderId) === 'you' ? 'Yours' : `${first(slot.holderId)}’s`} · Missed${photos.length ? ` · ${photos.length}` : ''}`}
          </T>
          <Icon name={CAMERA} size={17} color={c.muted} />
        </Pressable>
        {toast?.card === card && <Toast message={toast.message} onUndo={toast.undo} />}
      </View>
    );
  };

  const dutyBlock = (r: RotaRow, when: 'past' | 'today' | 'future') => (
    <Block key={`${r.duty.id}:${r.date}`} style={ledBy(r) && { marginLeft: 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <T size={17} weight="700" style={{ flex: 1 }}>
          {r.duty.name}
        </T>
        <Pill
          label={`${r.duty.effort_points} ${r.duty.effort_points === 1 ? 'pt' : 'pts'}${r.duty.group_size > 1 ? ' each' : ''}`}
        />
      </View>
      <T size={13} soft>
        {ledBy(r)
          ? `Comes with ${ledBy(r)!.name} — whoever does it does this too`
          : r.duty.group_size > 1
            ? `${r.duty.group_size} together, the same day · ${cadenceLabel(r.duty)}`
            : cadenceLabel(r.duty)}
      </T>
      {r.duty.plans_meals && r.slots.some((s) => s.holderId === me.id) && when === 'today' && (
        <T size={13} weight="600" soft>
          You also tell the cook what to make today.
        </T>
      )}
      {r.slots.length === 0 ? (
        <T size={15} weight="600" soft>
          Nobody is available — everyone in this duty is away.
        </T>
      ) : (
        <View style={{ gap: 10 }}>{r.slots.map((s) => slotRow(r, s, when))}</View>
      )}
    </Block>
  );

  return (
    // Duties is a tab, so there is no nav header to hang Manage off: the screen pins its own title row.
    <View style={{ flex: 1, backgroundColor: c.ground }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 12,
        }}>
        <T size={22} weight="700">
          Duties
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage duties"
          onPress={() => router.push('/duties/manage')}
          style={({ pressed }) => [
            {
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: 16,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: brass ? c.line : c.accentText,
            },
            pressed && { transform: [{ scale: 0.97 }] },
          ]}>
          <T size={15} weight="700" color={brass ? c.ink : c.accentText}>
            Manage
          </T>
        </Pressable>
      </View>
      <Screen padBottom={TAB_BAR}>
        <Block tone="raised" accessibilityLabel={digest}>
          <T size={15} weight="700">
            {digest}
          </T>
        </Block>

        <ErrorText error={error} />

        {duties.filter((d) => d.active).length === 0 && (
          <Block>
            <T size={17} weight="700">
              No duties yet
            </T>
            <T soft>
              Add the chores the six of you argue about, and FlatHub works out whose turn each one is — one mate at a
              time, or two together on the same day. Tap Manage above.
            </T>
          </Block>
        )}

        {groups.map((g) => (
          <View key={g.id ?? 'other'} style={{ gap: 16 }}>
            {/* One heading is no grouping at all: a flat that never uses areas sees no heading. */}
            {groups.length > 1 && <SectionLabel>{g.name}</SectionLabel>}
            {g.rows.map((r) => dutyBlock(r, 'today'))}
          </View>
        ))}

        {[...new Set(later.map((r) => r.date))].map((date) => (
          <View key={date} style={{ gap: 16 }}>
            <SectionLabel>{dayLabel(date)}</SectionLabel>
            {later.filter((r) => r.date === date).map((r) => dutyBlock(r, 'future'))}
          </View>
        ))}
        {later.length > 0 && (
          <T size={13} soft>
            You can offer a turn days before it falls due — it stays open until somebody takes it.
          </T>
        )}

        {/* Yesterday's misses are stated once, in one quiet block, BELOW today's work — not a block
            per duty at the top of the screen, which turns a record into a wall of accusations. */}
        {yesterday.some((r) => r.slots.some((s) => missed(s, r.date, now))) && (
          <Block style={{ gap: 0, paddingVertical: 8 }}>
            <SectionLabel>{dayLabel(yesterday[0].date)}</SectionLabel>
            {yesterday.flatMap((r) => r.slots.filter((s) => missed(s, r.date, now)).map((s) => missedRow(r, s)))}
            <T size={13} soft style={{ paddingTop: 8 }}>
              A missed duty is worked out from the schedule, never written down. It earns no credit, and nothing is
              charged for it.
            </T>
          </Block>
        )}

        {mates.length > 0 && (
          <Block>
            <SectionLabel>Where everyone stands</SectionLabel>
            {/* No bars and no shared column: a scoreboard is exactly what this screen must not be
                (DESIGN.md rule 4). One status word each, in fixed alphabetical order. */}
            {mates.map((m) => {
              const isAway = away(absences, m.memberId, now);
              const status = isAway
                ? 'Away — no turns'
                : m.memberId === nextUp
                  ? 'Next in line'
                  : turnOn.has(m.memberId)
                    ? `Turn on ${dayLabel(turnOn.get(m.memberId)!)}`
                    : 'No turn in the next few days';
              return (
                <View
                  key={m.memberId}
                  accessibilityRole="text"
                  accessibilityLabel={`${m.name}: ${status}`}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <T size={15} weight="600" numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </T>
                  {isAway ? (
                    <T
                      size={12}
                      weight="700"
                      color={c.warnFg}
                      style={{ backgroundColor: c.warnBg, borderRadius: 9999, paddingHorizontal: 9, paddingVertical: 4 }}>
                      {status}
                    </T>
                  ) : (
                    <T size={14} soft>
                      {status}
                    </T>
                  )}
                </View>
              );
            })}
            <Rule />
            {mine && (
              <T size={14} soft>
                You:{' '}
                <T size={14} num>
                  {mine.done}
                </T>{' '}
                of{' '}
                <T size={14} num>
                  {Math.round(mine.fair)}
                </T>{' '}
                pts since {dayLabel(anchor)}.
              </T>
            )}
            <T size={13} soft>
              The next turn always goes to whoever is furthest behind their fair share — never to a random name.
            </T>
          </Block>
        )}
      </Screen>
    </View>
  );
}

/** The state of one slot, at a glance. Every ring is paired with words: colour carries nothing alone. */
function Ring({ state }: { state: 'yours' | 'theirs' | 'done' | 'missed' | 'offered' }) {
  const c = usePalette();
  const box = {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };
  if (state === 'done')
    return (
      <View style={[box, { backgroundColor: c.positiveBg }]}>
        <Icon name={{ ios: 'checkmark', android: 'check' }} size={15} color={c.positive} />
      </View>
    );
  if (state === 'offered')
    return (
      <View style={[box, { borderWidth: 1.5, borderColor: c.line }]}>
        <Icon name={{ ios: 'arrow.up', android: 'arrow_upward' }} size={14} color={c.muted} />
      </View>
    );
  // yours is an ink ring; theirs and missed are muted hairlines — someone else's turn is an inert
  // mark, never a control that would reject the tap.
  return (
    <View
      style={[box, { borderWidth: state === 'yours' ? 2 : 1.5, borderColor: state === 'yours' ? c.ink : c.hair }]}
    />
  );
}

/**
 * A small action pill. kit's MagnetButton is 56pt and full width; two or three of these share a row.
 * Every control on this screen goes through here, so DESIGN.md rule 7 — targets of at least 48pt,
 * and every button a pill — holds for Done, Offer, Take it, Vouch and the photo alike. A quiet one
 * still carries a real `line` border (3:1+): nothing here is a bare text target pretending to be a
 * button, which is what the old Skip and Swap were.
 */
function Chip({
  label,
  icon,
  strong,
  accent,
  busy,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  icon?: { ios: string; android: string };
  strong?: boolean;
  accent?: boolean;
  busy?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const c = usePalette();
  const fill = busy ? c.raised : accent ? c.accent : strong ? c.solid : 'transparent';
  const fg = busy ? c.muted : accent ? c.onAccent : strong ? c.onSolid : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          paddingHorizontal: 16,
          borderRadius: 24,
          flexDirection: 'row',
          gap: 7,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill,
          borderWidth: 1.5,
          borderColor: strong || accent ? fill : c.line,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {icon && <Icon name={icon} size={16} color={fg} />}
      <T size={14} weight="700" color={fg}>
        {busy ? 'Saving…' : label}
      </T>
    </Pressable>
  );
}
