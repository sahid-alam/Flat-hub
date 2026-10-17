// The flat's calendar: who is on every day, past and future, worked out by the same rota the Duties tab
// uses — so a turn done shows done, a turn missed shows missed, and next week shows the order as it
// will actually fall, make-up turns included. Tap a day for its turns, meals, bills and fridge use-by
// dates; mark yourself away from here and see whose turns change before you commit.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { awayDays, awayPreview, marksOn, monthWeeks, shiftDate, type Mark } from '@/domain/calendar';
import { leaderOf, missed, offered, rota, type RotaRow, type Slot } from '@/domain/duties';
import { formatINR } from '@/domain/money';
import { isEmpty } from '@/domain/stock';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { dayLabel, monthLabel, sayError, today } from '@/lib/util';
import { useDuties } from '@/ui/duties';
import {
  Block,
  Choice,
  DateField,
  ErrorText,
  MagnetButton,
  Rule,
  Screen,
  SectionLabel,
  Sheet,
  T,
  usePalette,
} from '@/ui/kit';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function Calendar() {
  const c = usePalette();
  const h = useDuties();
  const {
    duties,
    members,
    absences,
    choreEvents,
    dutyMarks,
    me,
    name,
    reload,
    anchor,
    household,
    areas,
    meals,
    bills,
    lots,
    moves,
    products,
  } = h;
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [selected, setSelected] = useState(now);
  const [week, setWeek] = useState(false);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [away, setAway] = useState<{ from: string; to: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const weeks = monthWeeks(month);
  const shown = week ? weeks.filter((w) => w.includes(selected)).slice(0, 1) : weeks;
  const first = shown.flat().find(Boolean)!;
  const last = [...shown.flat()].reverse().find(Boolean)!;
  const all = rota(
    duties,
    members,
    absences,
    choreEvents,
    first,
    (Date.parse(last) - Date.parse(first)) / 86_400_000 + 1,
    anchor,
    now,
  );
  // The filter narrows what is drawn, never what the rota decides.
  const areaOf = (r: RotaRow) => (leaderOf(r.duty, duties) ?? r.duty).area_id ?? null;
  const rows: RotaRow[] = all
    .filter((r) => filter === 'all' || filter === 'me' || areaOf(r) === filter)
    .map((r) => (filter === 'me' ? { ...r, slots: r.slots.filter((s) => s.holderId === me.id) } : r))
    .filter((r) => r.slots.length > 0);
  const usedAreas = areas.filter((a) => duties.some((d) => d.active && d.area_id === a.id));
  const myAway = (date: string) =>
    absences.some((a) => a.member_id === me.id && a.from_date <= date && date <= a.to_date);

  const pick = (date: string) => {
    setSelected(date);
    setError(null);
  };
  const moveMonth = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    const m = d.toISOString().slice(0, 7);
    setMonth(m);
    pick(m === now.slice(0, 7) ? now : `${m}-01`);
  };
  const moveWeek = (n: number) => {
    const d = shiftDate(selected, 7 * n);
    setMonth(d.slice(0, 7));
    pick(d);
  };

  async function act(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await work();
      await reload();
    } catch (e) {
      setError(sayError(e));
    }
    setBusy(null);
  }
  const chore = (r: RotaRow, s: Slot, outcome: 'done' | 'swapped') =>
    insertOnce('chore_event', {
      id: newId(),
      household_id: household.id,
      duty_id: r.duty.id,
      member_id: outcome === 'swapped' ? s.ownerId : s.holderId,
      outcome,
      to_member_id: outcome === 'swapped' ? me.id : null,
      due_on: r.date,
    });
  const offer = (r: RotaRow, s: Slot) =>
    insertOnce('duty_mark', {
      id: newId(),
      household_id: household.id,
      duty_id: r.duty.id,
      due_on: r.date,
      member_id: s.ownerId,
      kind: 'offer',
      by_member_id: me.id,
    });
  const takeBack = async (r: RotaRow) => {
    const { error: e } = await supabase.rpc('withdraw_offer', {
      p_duty: r.duty.id,
      p_due: r.date,
    });
    if (e) throw e;
  };

  const day = rows.filter((r) => r.date === selected);
  const dayMeals = meals.filter((m) => m.date === selected).sort((a, b) => (a.meal < b.meal ? 1 : -1));
  const dayBills = bills.filter((b) => b.occurred_on === selected);
  const dayLots = lots.filter((l) => l.expiry_date === selected && !isEmpty(l.id, moves));
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Something';
  const first_ = (id: string) => (id === me.id ? 'you' : name(id).split(' ')[0]);

  return (
    <Screen>
      <Choice
        label="Show"
        options={[
          { value: 'all', label: 'Everyone' },
          { value: 'me', label: 'Just me' },
          ...usedAreas.map((a) => ({ value: a.id, label: a.name })),
        ]}
        value={filter}
        onChange={setFilter}
      />

      <Block style={{ gap: 10 }}>
        <View style={s.bar}>
          <Nav
            label={week ? 'Previous week' : 'Previous month'}
            glyph="‹"
            onPress={() => (week ? moveWeek(-1) : moveMonth(-1))}
          />
          <T size={16} weight="700" style={{ flex: 1, textAlign: 'center' }}>
            {monthLabel(month)}
          </T>
          <Nav
            label={week ? 'Next week' : 'Next month'}
            glyph="›"
            onPress={() => (week ? moveWeek(1) : moveMonth(1))}
          />
        </View>
        <View style={s.bar}>
          <Pill label="Today" onPress={() => (setMonth(now.slice(0, 7)), pick(now))} />
          <Pill label={week ? 'Month' : 'Week'} onPress={() => setWeek(!week)} />
        </View>
        <View style={s.grid}>
          {WD.map((d, i) => (
            <T key={i} size={11} weight="800" soft style={s.wd}>
              {d}
            </T>
          ))}
          {shown
            .flat()
            .map((date, i) =>
              date ? (
                <Cell
                  key={date}
                  date={date}
                  marks={marksOn(rows, date, me.id, now)}
                  today={date === now}
                  selected={date === selected}
                  past={date < now}
                  away={myAway(date)}
                  onPress={() => pick(date)}
                />
              ) : (
                <View key={`x${i}`} style={s.cell} />
              ),
            )}
        </View>
        <View style={s.legend}>
          <Legend mark="mine" label="yours" />
          <Legend mark="other" label="someone else's" />
          <Legend mark="done" label="done" />
          <Legend mark="missed" label="missed" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                backgroundColor: c.sunk,
              }}
            />
            <T size={12} soft>
              you&apos;re away
            </T>
          </View>
        </View>
      </Block>

      <SectionLabel>{dayLabel(selected)}</SectionLabel>
      <ErrorText error={error} />
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        {day.length === 0 ? (
          <T soft style={{ paddingVertical: 14 }}>
            {filter === 'me' ? 'Nothing of yours this day.' : 'No turns this day.'}
          </T>
        ) : (
          day.flatMap((r, i) =>
            r.slots.map((slot, j) => {
              const key = `${r.duty.id}:${r.date}:${slot.ownerId}`;
              const yours = slot.holderId === me.id;
              const isMissed = missed(slot, r.date, now);
              const claimed = slot.holderId !== slot.ownerId;
              const isOffered = !claimed && !slot.done && offered(dutyMarks, r.duty.id, r.date, slot.ownerId);
              const onIt = r.slots.some((o) => o.holderId === me.id);
              const status = slot.done
                ? `Done by ${first_(slot.holderId)}`
                : isMissed
                  ? `${yours ? 'Your' : `${first_(slot.holderId)}’s`} turn · missed`
                  : `${yours ? 'Your turn' : `${first_(slot.holderId)}’s turn`}${claimed ? ` · took it from ${first_(slot.ownerId)}` : ''}${isOffered ? ' · offered' : ''}`;
              return (
                <View key={key}>
                  {(i > 0 || j > 0) && <Rule />}
                  <View style={s.turn}>
                    <View style={{ flex: 1, minWidth: 150, gap: 2 }}>
                      <T size={15} weight="700">
                        {r.duty.name}
                      </T>
                      <T size={13} soft>
                        {status}
                        {slot.makeup && ' · make-up'}
                        {` · ${r.duty.effort_points} ${r.duty.effort_points === 1 ? 'pt' : 'pts'}`}
                      </T>
                    </View>
                    {yours && !slot.done && r.date === now && (
                      <Pill
                        label="Done"
                        strong
                        busy={busy === `${key}:done`}
                        onPress={() => act(`${key}:done`, () => chore(r, slot, 'done'))}
                      />
                    )}
                    {yours && !slot.done && !isMissed && !isOffered && !claimed && (
                      <Pill
                        label="Offer"
                        busy={busy === `${key}:offer`}
                        onPress={() => act(`${key}:offer`, () => offer(r, slot))}
                      />
                    )}
                    {yours && isOffered && (
                      <Pill
                        label="Take back"
                        busy={busy === `${key}:back`}
                        onPress={() => act(`${key}:back`, () => takeBack(r))}
                      />
                    )}
                    {!yours && isOffered && !isMissed && !onIt && (
                      <Pill
                        label="Take it"
                        strong
                        busy={busy === `${key}:take`}
                        onPress={() => act(`${key}:take`, () => chore(r, slot, 'swapped'))}
                      />
                    )}
                  </View>
                </View>
              );
            }),
          )
        )}
      </Block>

      {(dayMeals.length > 0 || dayBills.length > 0 || dayLots.length > 0) && (
        <Block style={{ gap: 8 }}>
          {dayMeals.map((m) => (
            <Line key={m.id} left={m.meal === 'lunch' ? 'Lunch' : 'Dinner'} right={`${m.text} · ${first_(m.by)}`} />
          ))}
          {dayBills.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(`/bills/${b.id}`)}>
              <Line left={b.label} right={`${formatINR(b.total_paise)} · paid by ${first_(b.paid_by)}`} />
            </Pressable>
          ))}
          {dayLots.map((l) => (
            <Line
              key={l.id}
              left={productName(l.product_id)}
              right={selected <= now ? 'use today' : 'use by this day'}
            />
          ))}
        </Block>
      )}

      {selected >= now && !myAway(selected) && (
        <MagnetButton
          label={`I'm away from ${dayLabel(selected)}…`}
          outline
          onPress={() => setAway({ from: selected, to: selected })}
        />
      )}

      {away && (
        <AwaySheet
          away={away}
          onChange={setAway}
          onClose={() => setAway(null)}
          preview={awayPreview(
            duties,
            members,
            absences,
            choreEvents,
            anchor,
            now,
            me.id,
            away.from,
            away.to < away.from ? away.from : away.to,
            new Date().toISOString(),
          )}
          name={first_}
          onSave={async () => {
            await insertOnce('member_absence', {
              id: newId(),
              household_id: household.id,
              member_id: me.id,
              from_date: away.from,
              to_date: away.to,
            });
            await reload();
            setAway(null);
          }}
        />
      )}
    </Screen>
  );
}

function AwaySheet({
  away,
  onChange,
  onClose,
  preview,
  name,
  onSave,
}: {
  away: { from: string; to: string };
  onChange: (a: { from: string; to: string }) => void;
  onClose: () => void;
  preview: { date: string; duty: string; from: string; to: string | null }[];
  name: (id: string) => string;
  onSave: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bad = away.to < away.from;
  const n = awayDays(away.from, away.to);
  return (
    <Sheet
      title="Mark yourself away"
      onClose={onClose}
      footer={
        <>
          <ErrorText error={error} />
          <MagnetButton
            label={
              busy ? 'Saving…' : bad ? 'Pick an end date after the start' : `Away ${n} ${n === 1 ? 'day' : 'days'}`
            }
            color="brass"
            disabled={busy || bad}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSave();
              } catch (e) {
                setError(sayError(e));
                setBusy(false);
              }
            }}
          />
        </>
      }>
      <DateField label="From" value={away.from} onChange={(from) => onChange({ ...away, from })} />
      <DateField
        label="Until (the last day you're away)"
        value={away.to}
        onChange={(to) => onChange({ ...away, to })}
      />
      {!bad && (
        <>
          <T size={13.5} weight="600" soft>
            {preview.length ? 'Turns that change hands' : 'No turn changes hands.'}
          </T>
          {preview.slice(0, 8).map((p, i) => (
            <Line
              key={i}
              left={`${dayLabel(p.date)} · ${p.duty}`}
              right={`${name(p.from)} → ${p.to ? name(p.to) : 'nobody free'}`}
            />
          ))}
          <T size={13} soft>
            You&apos;re skipped while away, nothing is held against you, and the list carries on.{' '}
            {n >= 3
              ? 'Three days or more, so your share of this month’s groceries goes down for those days.'
              : 'Under three days, so your share of the groceries doesn’t change.'}{' '}
            You can take this back today, or any time before it starts.
          </T>
        </>
      )}
    </Sheet>
  );
}

function Cell({
  date,
  marks,
  today: isToday,
  selected,
  past,
  away,
  onPress,
}: {
  date: string;
  marks: Mark[];
  today: boolean;
  selected: boolean;
  past: boolean;
  away: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const shown = marks.slice(0, 3);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${dayLabel(date)}${marks.length ? `, ${marks.length} ${marks.length === 1 ? 'turn' : 'turns'}` : ''}${marks.includes('mine') ? ', one is yours' : ''}${away ? ', you are away' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.cell,
        {
          borderRadius: 12,
          backgroundColor: selected ? c.raised : away ? c.sunk : 'transparent',
        },
        isToday && { borderWidth: 1.5, borderColor: c.ink },
        pressed && { opacity: 0.7 },
      ]}>
      <T size={13} weight="700" soft={past && !selected} num>
        {Number(date.slice(8))}
      </T>
      <View style={s.dots}>
        {shown.map((m, i) => (
          <Dot key={i} mark={m} />
        ))}
        {marks.length > 3 && (
          <T size={9} weight="800" soft>
            +
          </T>
        )}
      </View>
    </Pressable>
  );
}

function Dot({ mark }: { mark: Mark }) {
  const c = usePalette();
  const fill = {
    mine: c.accent,
    other: c.line,
    done: c.positive,
    missed: 'transparent',
  }[mark];
  return (
    <View style={[s.dot, { backgroundColor: fill }, mark === 'missed' && { borderWidth: 1.5, borderColor: c.line }]} />
  );
}

function Legend({ mark, label }: { mark: Mark; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Dot mark={mark} />
      <T size={12} soft>
        {label}
      </T>
    </View>
  );
}

function Line({ left, right }: { left: string; right: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 32,
        alignItems: 'center',
      }}>
      <T size={14.5} weight="600" style={{ flexShrink: 1 }}>
        {left}
      </T>
      <T size={13} soft style={{ flexShrink: 1, textAlign: 'right' }}>
        {right}
      </T>
    </View>
  );
}

function Nav({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.nav}>
      <T size={22} weight="700">
        {glyph}
      </T>
    </Pressable>
  );
}

function Pill({
  label,
  onPress,
  strong,
  busy,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  busy?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        {
          borderColor: strong ? c.ink : c.line,
          backgroundColor: strong ? c.solid : 'transparent',
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={13} weight="700" color={strong ? c.onSolid : c.ink}>
        {busy ? '…' : label}
      </T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    paddingBottom: 6,
    letterSpacing: 1,
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  dots: { flexDirection: 'row', gap: 3, height: 7, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  turn: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingVertical: 6,
  },
  nav: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
