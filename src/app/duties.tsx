// Whose turn it is, and where everyone stands. Every action appends one chore_event; nothing here
// ever updates or deletes a row. A skip earns no credit — see docs/DATA_MODEL.md ("Duties").
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { rota, standing } from '@/domain/duties';
import { newId } from '@/lib/id';
import { insertOnce } from '@/lib/supabase';
import { dayLabel, sayError, today } from '@/lib/util';
import { cadenceLabel, isOpen, useDuties } from '@/ui/duties';
import { Block, Choice, ErrorText, Pill, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

const AHEAD = 5; // today plus the next four days

type Outcome = 'done' | 'skipped' | 'swapped';
const initials = (name: string) => name.slice(0, 2).toUpperCase();

export default function Duties() {
  const c = usePalette();
  const { duties, members, absences, choreEvents, household, me, name, reload, anchor, todays } = useDuties();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  // One id per pending action, kept until a reload confirms it: a retry after a lost response hits
  // insertOnce's 23505 path instead of appending a second event and paying the points twice.
  const pending = useRef(new Map<string, string>());

  const now = today();
  const days = rota(duties, members, absences, choreEvents, now, AHEAD, anchor);
  const later = days.filter((r) => r.date !== now);
  // The bars must show the same numbers the engine assigns on, so the window is the whole history
  // since the anchor — that is what assignee() measures. See the report for month-to-date.
  const stands = standing(duties, members, absences, choreEvents, anchor, now, anchor);
  const current = new Set(members.filter((m) => !m.left_on || m.left_on >= now).map((m) => m.id));
  const mates = stands
    .filter((s) => current.has(s.memberId))
    .map((s) => ({ ...s, name: name(s.memberId) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const openToday = todays.filter((r) => isOpen(r.outcome));
  const digest = openToday.length
    ? `Today: ${openToday.map((r) => `${r.memberId ? name(r.memberId).split(' ')[0] : 'nobody free'} — ${r.duty.name}`).join(' · ')}`
    : todays.length
      ? 'Today: all done.'
      : 'No duties due today.';

  async function record(r: (typeof days)[number], outcome: Outcome, toMemberId: string | null = null) {
    if (!r.memberId) return;
    const key = `${r.duty.id}:${r.date}:${outcome}:${toMemberId ?? ''}`;
    const id = pending.current.get(key) ?? newId();
    pending.current.set(key, id);
    setBusy(key);
    setError(null);
    try {
      await insertOnce('chore_event', {
        id,
        household_id: household.id,
        duty_id: r.duty.id,
        member_id: r.memberId,
        outcome,
        to_member_id: toMemberId,
        due_on: r.date,
      });
      await reload();
      pending.current.delete(key); // only once the event is visible: before that, the id must stand
      setSwapping(null);
    } catch (e) {
      setError(sayError(e));
    }
    setBusy(null);
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: 'Duties',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/duties/manage')}
              style={{ minHeight: 48, justifyContent: 'center' }}>
              <Pill label="Manage" />
            </Pressable>
          ),
        }}
      />

      <Block tone="raised" accessibilityLabel={`Today's duties. ${digest}`}>
        <T size={15} weight="700">
          {dayLabel(now)} · {digest}
        </T>
      </Block>

      <ErrorText error={error} />

      {duties.filter((d) => d.active).length === 0 && (
        <Block>
          <T size={17} weight="700">
            No duties yet
          </T>
          <T soft>
            Add the chores this flat actually does — dishes, kitchen floor, bins — and FlatHub works out whose turn
            each one is. Tap Manage above.
          </T>
        </Block>
      )}

      {todays.map((r) => {
        const key = `${r.duty.id}:${r.date}`;
        const mine = r.memberId === me.id;
        const swapped = r.outcome === 'swapped';
        const who = r.memberId ? name(r.memberId) : null;
        // The latest swap of this instance, by id (UUIDv7 sorts by time); a reversal row is not one.
        const from = swapped
          ? choreEvents
              .filter((e) => e.duty_id === r.duty.id && e.due_on === r.date && e.outcome === 'swapped' && !e.reverses_id)
              .sort((a, b) => (a.id < b.id ? -1 : 1))
              .pop()
          : null;
        return (
          <Block key={key} accessibilityLabel={`${r.duty.name}, ${r.duty.effort_points} points, ${mine ? 'your turn' : `${who ?? 'nobody'}'s turn`}`}>
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
                      backgroundColor: mine ? c.ink : c.raised,
                    }}>
                    <T size={11} weight="700" color={mine ? c.ground : c.ink}>
                      {initials(who)}
                    </T>
                  </View>
                  <T size={15} weight="700">
                    {mine ? 'Your turn' : `${who.split(' ')[0]}'s turn`}
                  </T>
                </View>
              )}
              <T size={13} soft>
                {cadenceLabel(r.duty)}
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
                Nobody is available today — everyone due a turn is away.
              </T>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Action
                    label="Done"
                    accent={mine}
                    disabled={!!busy}
                    accessibilityLabel={`${r.duty.name} · mark done`}
                    onPress={() => record(r, 'done')}
                  />
                  <Action
                    label="Skip"
                    disabled={!!busy}
                    accessibilityLabel={`${r.duty.name} · skip, earns no points`}
                    onPress={() => record(r, 'skipped')}
                  />
                  <Action
                    label="Swap"
                    disabled={!!busy}
                    accessibilityLabel={`${r.duty.name} · swap with someone else`}
                    onPress={() => setSwapping(swapping === key ? null : key)}
                  />
                </View>
                {swapping === key && (
                  <View style={{ gap: 6 }}>
                    <SectionLabel>Swap to</SectionLabel>
                    <Choice
                      options={members
                        .filter((m) => m.id !== r.memberId && current.has(m.id))
                        .map((m) => ({ value: m.id, label: m.display_name.split(' ')[0] }))}
                      value=""
                      onChange={(id) => record(r, 'swapped', id)}
                    />
                  </View>
                )}
                {mine && (
                  <T size={13} soft>
                    Skip earns no points — you stay where you are in the rota. Swap hands this one over, and the points
                    go with it.
                  </T>
                )}
              </View>
            )}
          </Block>
        );
      })}

      {later.length > 0 && (
        <Block style={{ gap: 0, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>Next few days</SectionLabel>
            <T size={13} soft>
              Already decided
            </T>
          </View>
          {later.map((r, i) => (
            <View key={`${r.duty.id}:${r.date}`}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline', paddingVertical: 7 }}>
                <T size={13} weight="700" soft style={{ width: 62 }}>
                  {dayLabel(r.date)}
                </T>
                <T size={14} weight="600" style={{ flex: 1 }}>
                  {r.duty.name}
                </T>
                <T size={14} soft>
                  {r.memberId ? name(r.memberId).split(' ')[0] : 'nobody free'}
                </T>
              </View>
            </View>
          ))}
        </Block>
      )}

      {mates.length > 0 && (
        <Block>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionLabel>Where everyone stands</SectionLabel>
            <T size={13} soft>
              Since {dayLabel(anchor)}
            </T>
          </View>
          {mates.map((m) => {
            const awayNow = absences.some((a) => a.member_id === m.memberId && a.from_date <= now && now <= a.to_date);
            const top = Math.max(m.done, m.fair, 1);
            const label = `${m.done} of ${Math.round(m.fair)} pts`;
            return (
              <View key={m.memberId} style={{ gap: 4 }}>
                <View
                  accessibilityRole="text"
                  accessibilityLabel={`${m.name}: ${m.done} points done of a ${Math.round(m.fair)} point fair share${awayNow ? ', away' : ''}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T size={14} weight="600" style={{ width: 54 }} numberOfLines={1}>
                    {m.name.split(' ')[0]}
                  </T>
                  <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: c.raised }}>
                    <View
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, backgroundColor: c.ink, width: `${pct(m.done / top)}%` }}
                    />
                    <View style={{ position: 'absolute', top: -3, bottom: -3, left: `${pct(m.fair / top)}%`, width: 2, backgroundColor: c.muted }} />
                  </View>
                  <T size={13} num soft style={{ width: 78, textAlign: 'right' }}>
                    {label}
                  </T>
                </View>
                {awayNow && (
                  <View style={{ paddingLeft: 64 }}>
                    <T size={12} weight="700" color={c.warnFg} style={{ backgroundColor: c.warnBg, borderRadius: 11, paddingHorizontal: 9, paddingVertical: 1, alignSelf: 'flex-start' }}>
                      Away — no turns
                    </T>
                  </View>
                )}
              </View>
            );
          })}
          <Rule />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 14, height: 8, borderRadius: 4, backgroundColor: c.ink }} />
            <T size={12} soft>
              Done
            </T>
            <View style={{ width: 2, height: 12, marginLeft: 8, backgroundColor: c.muted }} />
            <T size={12} soft>
              Fair share
            </T>
          </View>
          <T size={13} soft>
            A skip earns no credit. The next turn always goes to whoever is furthest behind their fair share — never to
            a random name.
          </T>
        </Block>
      )}
    </Screen>
  );
}

const pct = (n: number) => +(Math.max(0, Math.min(1, n)) * 100).toFixed(1);

/** One of the three 48pt action pills. kit's MagnetButton is 56pt and full width; three must fit a row. */
function Action({
  label,
  accent,
  disabled,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accent?: boolean;
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: label === 'Done' ? 1.3 : 1,
          minHeight: 48,
          borderRadius: 24,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: accent ? c.accent : 'transparent',
          borderColor: accent ? c.accent : c.line,
        },
        disabled && { opacity: 0.45 },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={15} weight="700" color={accent ? c.onAccent : c.ink}>
        {label}
      </T>
    </Pressable>
  );
}
