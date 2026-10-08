// Add or edit one duty. Reworked, not restyled: four plain sections in the order the questions get
// asked, and before you can save it PRINTS THE ROTA it is about to make, so the consequence of
// "two people" and "who's in" is visible rather than described.
//
// Reordering the rota lives HERE, behind an explicit Edit. That is "I can't have Monday because of
// college, I can do Tuesday" — a permanent change to who comes first. It is NOT the same feature as
// offering one instance, which lives on the Duties tab and happens once.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useHousehold, type DutyRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { confirm, sayError } from '@/lib/util';
import { previewRota } from '@/ui/duties';
import { Block, Choice, ErrorText, Field, Icon, MagnetButton, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

const POINTS = ['1', '2', '3', '5', '8'];
const SIZES = ['1', '2', '3'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** The four cadences a flat actually uses, plus the two open-ended ones underneath. */
const CADENCES = [
  { value: 'd1', label: 'Every day' },
  { value: 'd2', label: 'Every 2 days' },
  { value: 'd7', label: 'Weekly' },
  { value: 'wd', label: 'Pick the days' },
  { value: 'dn', label: 'Every N days' },
] as const;
type Cadence = (typeof CADENCES)[number]['value'];

type Payload = {
  name: string;
  effort_points: number;
  every_days: number | null;
  weekdays: number[] | null;
  schedule: 'rolling' | 'fixed';
  fixed_member_id: string | null;
  active: boolean;
  group_size: number;
  plans_meals: boolean;
  roster: string[] | null;
};

const cadenceOf = (d: DutyRow | null): Cadence =>
  !d ? 'd1' : d.weekdays ? 'wd' : d.every_days === 1 ? 'd1' : d.every_days === 2 ? 'd2' : d.every_days === 7 ? 'd7' : 'dn';

export default function EditDuty() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { duties, members, household, reload, name: nameOf } = useHousehold();
  const duty = duties.find((d) => d.id === id) ?? null;
  const mates = members.filter((m) => !m.left_on);

  const [text, setText] = useState(duty?.name ?? '');
  const [points, setPoints] = useState(String(duty?.effort_points ?? 1));
  const [cadence, setCadence] = useState<Cadence>(cadenceOf(duty));
  const [weekdays, setWeekdays] = useState<number[]>(duty?.weekdays ?? []);
  const [everyDays, setEveryDays] = useState(String(duty?.every_days ?? 3));
  const [size, setSize] = useState(String(duty?.group_size ?? 1));
  // The roster is ORDERED, and the order is the rota's tie-break. A duty with no roster is the whole
  // flat; opening the form materialises that so "who's in" and the preview have something to show.
  const [roster, setRoster] = useState<string[]>(duty?.roster ?? mates.map((m) => m.id));
  const [meals, setMeals] = useState(duty?.plans_meals ?? false);
  const [reorder, setReorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = text.trim().replace(/\s+/g, ' ');
  const n = Number(everyDays);
  const nOk = Number.isInteger(n) && n >= 1 && n <= 90;
  const group = Number(size);
  const inRoster = roster.filter((rid) => mates.some((m) => m.id === rid));
  const cadenceOk = cadence === 'wd' ? weekdays.length > 0 : cadence === 'dn' ? nOk : true;
  // The button says what is missing rather than sitting grey and silent (DESIGN.md rule 2).
  const blocker = !name.length
    ? 'Name the duty first'
    : !cadenceOk
      ? cadence === 'wd'
        ? 'Pick at least one weekday'
        : 'Pick 1 to 90 days'
      : inRoster.length < group
        ? `Pick at least ${group} ${group === 1 ? 'mate' : 'mates'}`
        : null;

  const payload = (): Payload => ({
    name,
    effort_points: Number(points),
    // Exactly one cadence: the unused one must be null, never an empty array.
    every_days: cadence === 'wd' ? null : cadence === 'dn' ? n : cadence === 'd1' ? 1 : cadence === 'd2' ? 2 : 7,
    weekdays: cadence === 'wd' ? [...weekdays].sort() : null,
    // Schedule and fixed_member_id are not asked for any more: "always one mate" is a roster of one,
    // which is one concept instead of two. A duty saved as fixed before the rework keeps its setting.
    schedule: duty?.schedule ?? 'rolling',
    fixed_member_id: duty?.fixed_member_id ?? null,
    active: duty?.active ?? true,
    group_size: group,
    plans_meals: meals,
    // Everybody, in member order, is the same as no roster — store null so the duty follows the flat
    // as mates come and go.
    roster: inRoster.length === mates.length && inRoster.every((rid, i) => rid === mates[i].id) ? null : inRoster,
  });

  async function save(change: Partial<Payload> = {}) {
    setBusy(true);
    setError(null);
    try {
      const row = { ...payload(), ...change };
      if (duty) {
        // Exactly the ten granted columns: anything else is a column-level permission denied.
        const { error: e } = await supabase.from('duty').update(row).eq('id', duty.id);
        if (e) throw e;
      } else {
        await insertOnce('duty', { id: newId(), household_id: household.id, ...row });
      }
      await reload();
      router.back();
    } catch (e) {
      setError(sayError(e));
      setBusy(false);
    }
  }

  async function retire() {
    if (!duty) return;
    if (
      await confirm(
        `Retire ${duty.name}?`,
        'It stops coming round. Every turn already done keeps its points, and you can restore it from the list.',
        'Retire it',
      )
    )
      await save({ active: false });
  }

  // What these settings would actually produce, from a cold start. The rota is deterministic, so this
  // is the real thing and not an illustration.
  // Long enough for one full cycle: every mate in the roster, group_size at a time.
  const period = cadence === 'wd' ? 1 : cadence === 'dn' ? n : cadence === 'd7' ? 7 : Number(cadence.slice(1));
  const span = Math.min(28, Math.max(1, period) * Math.ceil(inRoster.length / Math.max(1, group)));
  const lines =
    cadenceOk && inRoster.length
      ? previewRota(
          {
            id: duty?.id ?? 'preview',
            ...payload(),
            name: name || 'This duty',
            roster: inRoster,
            schedule: 'rolling',
            fixed_member_id: null,
          },
          members,
          nameOf,
          span,
        )
      : [];

  return (
    <Screen>
      <Block>
        <Field label="Name" value={text} onChangeText={setText} placeholder="e.g. Terrace sweep" maxLength={60} />
      </Block>

      <SectionLabel>When, and what it is worth</SectionLabel>
      <Block>
        <T size={13.5} weight="600" soft>
          How often
        </T>
        <Choice options={CADENCES.map((o) => ({ ...o }))} value={cadence} onChange={setCadence} />
        {cadence === 'wd' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {WD.map((label, i) => (
              <Day
                key={label}
                label={label}
                on={weekdays.includes(i)}
                onPress={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((w) => w !== i) : [...weekdays, i])}
              />
            ))}
          </View>
        )}
        {cadence === 'dn' && (
          <Field
            label="Every how many days? (1–90)"
            value={everyDays}
            onChangeText={setEveryDays}
            keyboardType="number-pad"
            maxLength={2}
          />
        )}
        <Rule />
        <T size={13.5} weight="600" soft>
          Points, per person, per turn
        </T>
        <Choice options={POINTS.map((p) => ({ value: p, label: p }))} value={points} onChange={setPoints} />
        <T size={13} soft>
          A heavier chore is worth more, so one bathroom clean can balance three bin runs.
        </T>
      </Block>

      <SectionLabel>Who does it</SectionLabel>
      <Block>
        <T size={13.5} weight="600" soft>
          How many at once
        </T>
        <Choice options={SIZES.map((v) => ({ value: v, label: v }))} value={size} onChange={setSize} />
        {group > 1 && (
          <T size={13} soft>
            {group} mates do this duty <T size={13} weight="700">together, on the same day</T>. They are not taking
            turns. Each of them ticks their own turn and earns the points separately.
          </T>
        )}
        <Rule />
        <T size={13.5} weight="600" soft>
          Who&apos;s in
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {mates.map((m) => (
            <Day
              key={m.id}
              label={m.display_name.split(' ')[0]}
              on={roster.includes(m.id)}
              onPress={() =>
                setRoster(roster.includes(m.id) ? roster.filter((r) => r !== m.id) : [...roster, m.id])
              }
            />
          ))}
        </View>
        {duty?.schedule === 'fixed' && (
          <T size={13} soft>
            This duty was set to always{' '}
            {duty.fixed_member_id ? nOf(nameOf(duty.fixed_member_id)) : 'one mate'} before the rework, and it keeps
            that. Narrow &quot;who&apos;s in&quot; to one mate for the same thing.
          </T>
        )}
      </Block>

      {lines.length > 0 && (
        <Block tone="raised">
          <SectionLabel>So the rota comes out like this</SectionLabel>
          {lines.map((line, i) => (
            <T key={i} size={15} weight="600">
              {line}
            </T>
          ))}
          <T size={13} soft>
            Then it starts again. Effort points still come first, so whoever falls behind is picked earlier than the
            order says.
          </T>
        </Block>
      )}

      <SectionLabel>What else it carries</SectionLabel>
      <Block>
        <T size={15} weight="600">
          Plans the meals
        </T>
        <T size={13} soft>
          Whoever is on this duty tells the cook what to make, and gets asked on their home screen.
        </T>
        <Choice
          label="Plans the meals"
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          value={meals ? 'yes' : 'no'}
          onChange={(v) => setMeals(v === 'yes')}
        />
      </Block>

      {inRoster.length > 1 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <SectionLabel>The order</SectionLabel>
            {/* A pill, not a bare word: DESIGN.md rule 7 wants 48pt and a real button. It is a
                button that opens a mode, not a set toggle, so it keeps the button role. */}
            <Day
              label={reorder ? 'Done' : 'Edit'}
              on={reorder}
              onPress={() => setReorder(!reorder)}
              role="button"
              a11yLabel={reorder ? 'Done reordering' : 'Edit the order'}
            />
          </View>
          <Block style={{ gap: 0, paddingVertical: 4 }}>
            {inRoster.map((rid, i) => (
              <View key={rid}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 8 }}>
                  <T size={15} weight="600" style={{ flex: 1 }}>
                    {nameOf(rid).split(' ')[0]}
                  </T>
                  {/* ponytail: two buttons, not drag-and-drop. Dragging fights the row's own swipe,
                      needs a gesture provider at the root, and cannot be driven by a screen reader. */}
                  {reorder && (
                    <>
                      <Move
                        label={`Move ${nameOf(rid).split(' ')[0]} up`}
                        icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up' }}
                        disabled={i === 0}
                        onPress={() => setRoster(swap(inRoster, i, i - 1))}
                      />
                      <Move
                        label={`Move ${nameOf(rid).split(' ')[0]} down`}
                        icon={{ ios: 'chevron.down', android: 'keyboard_arrow_down' }}
                        disabled={i === inRoster.length - 1}
                        onPress={() => setRoster(swap(inRoster, i, i + 1))}
                      />
                    </>
                  )}
                </View>
              </View>
            ))}
          </Block>
          <T size={13} soft>
            &quot;I can&apos;t have Monday because of college, I can do Tuesday&quot; — move yourself down a row. That
            is permanent, and it lives here. Offering one turn is a different thing and lives on the Duties tab.
          </T>
        </>
      )}

      <ErrorText error={error} />

      <MagnetButton
        label={busy ? 'Saving…' : (blocker ?? (duty ? 'Save duty' : 'Add duty'))}
        color="brass"
        disabled={busy || blocker !== null}
        onPress={() => save()}
      />
      {duty?.active && <MagnetButton label="Retire this duty" outline disabled={busy} onPress={retire} />}
      {duty && !duty.active && (
        <MagnetButton label="Bring it back" outline disabled={busy} onPress={() => save({ active: true })} />
      )}
    </Screen>
  );
}

const nOf = (full: string) => full.split(' ')[0];
const swap = (xs: string[], a: number, b: number) => {
  const out = [...xs];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};

/** A toggle, 48pt. kit's Choice is single-select and both weekdays and the roster are sets. */
function Day({
  label,
  on,
  onPress,
  role = 'checkbox',
  a11yLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'button';
  a11yLabel?: string;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: on } : { expanded: on }}
      accessibilityLabel={a11yLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          // A wrapping row, never seven 37px toggles squeezed onto a 360px phone.
          minWidth: 52,
          paddingHorizontal: 12,
          minHeight: 48,
          borderRadius: 24,
          borderWidth: 1.5,
          flexDirection: 'row',
          gap: 5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? c.raised : 'transparent',
          borderColor: on ? c.ink : c.line,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {/* kit's Choice marks the picked chip with a check; a set of toggles needs the same tell, or
          a row where everything is on looks like a row where nothing is. */}
      {on && <Icon name={{ ios: 'checkmark', android: 'check' }} size={15} color={c.ink} />}
      <T size={13} weight="700">
        {label}
      </T>
    </Pressable>
  );
}

function Move({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: { ios: string; android: string };
  disabled: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1.5,
          borderColor: disabled ? c.hair : c.line,
        },
        pressed && { opacity: 0.6 },
      ]}>
      <Icon name={icon} size={18} color={disabled ? c.hair : c.ink} />
    </Pressable>
  );
}
