// Whose turn it is, and where everyone stands. Every action appends one chore_event; nothing here
// ever updates or deletes a row — Undo writes a reversal. A skip earns no credit — see
// docs/DATA_MODEL.md ("Duties").
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { away, rota, standing } from '@/domain/duties';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dayLabel, sayError, today } from '@/lib/util';
import { cadenceLabel, isOpen, useDuties } from '@/ui/duties';
import { Block, Choice, ErrorText, Pill, Rule, Screen, SectionLabel, T, Toast, usePalette } from '@/ui/kit';

const AHEAD = 5; // today plus the next four days
const BACK = 2; // the two days behind today, so a late Done is still recordable

type Outcome = 'done' | 'skipped' | 'swapped';
const initials = (name: string) => name.slice(0, 2).toUpperCase();
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
const list = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;

export default function Duties() {
  const c = usePalette();
  const { duties, members, absences, choreEvents, household, me, name, reload, anchor } = useDuties();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [toast, setToast] = useState<{ card: string; message: string; undo: () => void } | null>(null);
  // One id per pending action, kept until a reload confirms it: a retry after a lost response hits
  // insertOnce's 23505 path instead of appending a second event and paying the points twice.
  const pending = useRef(new Map<string, string>());

  const now = today();
  // From two days back, so an instance nobody recorded on the day doesn't become unrecordable.
  const days = rota(duties, members, absences, choreEvents, shift(now, -BACK), AHEAD + BACK, anchor);
  const late = days.filter((r) => r.date < now && isOpen(r.outcome));
  const todays = days.filter((r) => r.date === now);
  const later = days.filter((r) => r.date > now);
  // The status words must match the engine, so the window is the whole history since the anchor —
  // that is exactly what assignee() measures.
  const stands = standing(duties, members, absences, choreEvents, anchor, now, anchor);
  const current = new Set(members.filter((m) => !m.left_on || m.left_on >= now).map((m) => m.id));
  const mates = stands
    .filter((s) => current.has(s.memberId))
    .map((s) => ({ ...s, name: name(s.memberId) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const openToday = todays.filter((r) => isOpen(r.outcome));
  // Collapse the names: one mate's name once, not once per duty. Nobody should read their own name
  // five times down one screen.
  const whoToday = [...new Set(openToday.map((r) => (r.memberId ? name(r.memberId).split(' ')[0] : 'nobody free')))];
  const digest = !todays.length
    ? 'No duties due today.'
    : !openToday.length
      ? 'All of today’s duties are done.'
      : whoToday.length === 1
        ? `${openToday.length} ${openToday.length === 1 ? 'duty' : 'duties'} today — all ${whoToday[0]}’s.`
        : `${openToday.length} duties today — ${list(whoToday)}.`;

  // Who the engine picks next, and when each mate's next open turn falls. Words, never a ranking.
  const upcoming = [...late, ...todays, ...later].filter((r) => isOpen(r.outcome) && r.memberId);
  const nextUp = upcoming[0]?.memberId ?? null;
  const turnOn = new Map<string, string>();
  for (const r of upcoming) if (r.memberId && !turnOn.has(r.memberId)) turnOn.set(r.memberId, r.date);
  const mine = mates.find((m) => m.memberId === me.id);

  async function record(r: (typeof days)[number], outcome: Outcome, toMemberId: string | null = null) {
    if (!r.memberId) return;
    const card = `${r.duty.id}:${r.date}`;
    const key = `${card}:${outcome}:${toMemberId ?? ''}`;
    const id = pending.current.get(key) ?? newId();
    pending.current.set(key, id);
    const row = {
      household_id: household.id,
      duty_id: r.duty.id,
      member_id: r.memberId,
      outcome,
      to_member_id: toMemberId,
      due_on: r.date,
    };
    setBusy(key);
    setError(null);
    setToast(null);
    try {
      await insertOnce('chore_event', { id, ...row });
      await reload();
      pending.current.delete(key); // only once the event is visible: before that, the id must stand
      setSwapping(null);
      setToast({
        card,
        message:
          outcome === 'done'
            ? `${r.duty.name} done`
            : outcome === 'skipped'
              ? `${r.duty.name} skipped — no points`
              : `${r.duty.name} handed to ${toMemberId ? name(toMemberId).split(' ')[0] : 'a mate'}`,
        // A mistake is corrected with a reversing row that mirrors the original, never a delete.
        undo: async () => {
          setBusy(`${key}:undo`);
          try {
            await insertOnce('chore_event', { id: newId(), ...row, reverses_id: id });
            await reload();
            setToast(null);
          } catch (e) {
            setError(sayError(e));
          }
          setBusy(null);
        },
      });
    } catch (e) {
      setError(sayError(e));
    }
    setBusy(null);
  }

  // Accent once per screen: the first open instance that is yours gets the brass Done. If none is,
  // the header's Manage carries the screen's one accent instead.
  const brassCard = [...late, ...todays].find((r) => isOpen(r.outcome) && r.memberId === me.id);
  const brassKey = brassCard ? `${brassCard.duty.id}:${brassCard.date}` : null;

  const card = (r: (typeof days)[number], stale: boolean) => {
    const key = `${r.duty.id}:${r.date}`;
    const yours = r.memberId === me.id;
    const who = r.memberId ? name(r.memberId) : null;
    // The latest swap of this instance, by id (UUIDv7 sorts by time); a reversal row is not one.
    const from =
      r.outcome === 'swapped'
        ? choreEvents
            .filter((e) => e.duty_id === r.duty.id && e.due_on === r.date && e.outcome === 'swapped' && !e.reverses_id)
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .pop()
        : null;
    return (
      <Block
        key={key}
        accessibilityLabel={`${r.duty.name}, ${r.duty.effort_points} points, ${yours ? 'your turn' : `${who ?? 'nobody'}'s turn`}${stale ? `, still open from ${dayLabel(r.date)}` : ''}`}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <T size={17} weight="700" style={{ flex: 1 }}>
            {r.duty.name}
          </T>
          <Pill label={`${r.duty.effort_points} ${r.duty.effort_points === 1 ? 'pt' : 'pts'}`} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {who && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: yours ? c.ink : c.raised,
                }}>
                <T size={11} weight="700" color={yours ? c.ground : c.ink}>
                  {initials(who)}
                </T>
              </View>
              <T size={15} weight="700">
                {yours ? 'Your turn' : `${who.split(' ')[0]}’s turn`}
              </T>
            </View>
          )}
          <T size={13} soft>
            {stale ? `Still open from ${dayLabel(r.date)}` : cadenceLabel(r.duty)}
          </T>
        </View>
        {from && (
          <T size={13} weight="600" soft>
            {`Swapped from ${name(from.member_id).split(' ')[0]} — the points come with it, and ${name(from.member_id).split(' ')[0]} keeps their place in the rotation.`}
          </T>
        )}

        {!isOpen(r.outcome) ? (
          <T size={15} weight="600" soft>
            {r.outcome === 'done' ? `Done by ${who ?? 'a mate'}.` : 'Skipped — it earned no points.'}
          </T>
        ) : !r.memberId ? (
          <T size={15} weight="600" soft>
            Nobody is available — everyone due a turn is away.
          </T>
        ) : (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Action
                label="Done"
                primary
                accent={key === brassKey}
                busy={busy === `${key}:done:`}
                accessibilityLabel={`${r.duty.name} · mark done`}
                onPress={() => record(r, 'done')}
              />
              <Action
                label="Skip"
                busy={busy === `${key}:skipped:`}
                accessibilityLabel={`${r.duty.name} · skip, earns no points`}
                onPress={() => record(r, 'skipped')}
              />
              <Action
                label="Swap"
                accessibilityLabel={`${r.duty.name} · swap with someone else`}
                onPress={() => setSwapping(swapping === key ? null : key)}
              />
            </View>
            {swapping === key && (
              <View style={{ gap: 6 }}>
                <SectionLabel>Swap to</SectionLabel>
                <Choice
                  // Only mates who are actually here on the day: a chore can't be dumped on someone away.
                  options={members
                    .filter((m) => m.id !== r.memberId && current.has(m.id) && !away(absences, m.id, r.date))
                    .map((m) => ({ value: m.id, label: m.display_name.split(' ')[0] }))}
                  value=""
                  onChange={(id) => record(r, 'swapped', id)}
                />
              </View>
            )}
            {yours && (
              <T size={13} soft>
                Skip earns no points — you stay where you are in the rota. Swap hands this one over, and the points go
                with it.
              </T>
            )}
          </View>
        )}
        {toast?.card === key && <Toast message={toast.message} onUndo={toast.undo} style={{ marginTop: 4 }} />}
      </Block>
    );
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Duties',
          headerRight: () => (
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
                  borderColor: brassKey ? c.line : c.accentText,
                },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}>
              <T size={15} weight="700" color={brassKey ? c.ink : c.accentText}>
                Manage
              </T>
            </Pressable>
          ),
        }}
      />

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
            Add the chores this flat actually does — dishes, kitchen floor, bins — and FlatHub works out whose turn each
            one is. Tap Manage above.
          </T>
        </Block>
      )}

      {late.map((r) => card(r, true))}
      {todays.map((r) => card(r, false))}

      {later.length > 0 && (
        <Block style={{ gap: 0, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>Next few days</SectionLabel>
            <T size={13} soft>
              Already decided
            </T>
          </View>
          {[...new Set(later.map((r) => r.date))].map((date, i) => {
            const rows = later.filter((r) => r.date === date);
            const who = [...new Set(rows.map((r) => (r.memberId ? name(r.memberId).split(' ')[0] : 'nobody free')))];
            return (
              <View key={date} style={{ paddingVertical: 8, gap: 2 }}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingTop: i > 0 ? 8 : 0 }}>
                  <T size={13} weight="700" soft>
                    {dayLabel(date)}
                  </T>
                  <T size={13} soft>
                    {list(who)}
                  </T>
                </View>
                <T size={14} weight="600">
                  {rows.map((r) => r.duty.name).join(', ')}
                </T>
              </View>
            );
          })}
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
            A skip earns no credit. The next turn always goes to whoever is furthest behind their fair share — never to
            a random name.
          </T>
        </Block>
      )}
    </Screen>
  );
}

/** One of the three action pills. kit's MagnetButton is 56pt and full width; three must fit a row. */
function Action({
  label,
  primary,
  accent,
  busy,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  primary?: boolean;
  accent?: boolean;
  busy?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const c = usePalette();
  // Done is the only filled pill; Skip and Swap are borderless, so a one-tap Skip never carries the
  // same weight as a Done. Busy shows on the tapped pill alone — the rest stay live.
  const fill = busy ? c.raised : accent ? c.accent : primary ? c.solid : 'transparent';
  const fg = busy ? c.muted : accent ? c.onAccent : primary ? c.onSolid : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: primary ? 1.3 : 1,
          minHeight: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fill,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={15} weight="700" color={fg}>
        {busy ? 'Saving…' : label}
      </T>
    </Pressable>
  );
}
