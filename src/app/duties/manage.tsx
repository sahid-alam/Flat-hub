// Add and edit the flat's duties. A duty is household data, not a ledger: members may insert and
// update it. Nobody can delete one — retiring sets active = false, so the history keeps pointing
// at something. See docs/DATA_MODEL.md ("Duties").
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useHousehold, type DutyRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { sayError } from '@/lib/util';
import { cadenceLabel } from '@/ui/duties';
import { Block, Choice, ErrorText, Field, MagnetButton, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

const POINTS = ['1', '2', '3', '5', '8'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ManageDuties() {
  const { duties, members, household, reload, name } = useHousehold();
  // null means the form is adding a new duty; a row means it is editing that one.
  const [editing, setEditing] = useState<DutyRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mates = members.filter((m) => !m.left_on);
  const ordered = [...duties.filter((d) => d.active), ...duties.filter((d) => !d.active)];

  /** `id` names the row to update; null adds one. Restore passes the row it sits on, not whatever
   *  the form happens to be editing. */
  async function save(payload: Payload, id: string | null) {
    setBusy(true);
    setError(null);
    try {
      if (id) {
        // Exactly the seven granted columns: anything else is a column-level permission denied.
        const { error: e } = await supabase.from('duty').update(payload).eq('id', id);
        if (e) throw e;
      } else {
        await insertOnce('duty', { id: newId(), household_id: household.id, ...payload });
      }
      await reload();
      setEditing(null);
    } catch (e) {
      setError(sayError(e));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Block style={{ gap: 0, paddingBottom: 8 }}>
        <SectionLabel>Duties</SectionLabel>
        {ordered.length === 0 && (
          <T soft style={{ paddingVertical: 12 }}>
            Nothing yet. Fill the form below for the first one.
          </T>
        )}
        {ordered.map((d, i) => (
          <View key={d.id}>
            {i > 0 && <Rule />}
            <DutyLine
              duty={d}
              mate={d.schedule === 'fixed' && d.fixed_member_id ? name(d.fixed_member_id).split(' ')[0] : null}
              picked={editing?.id === d.id}
              busy={busy}
              onPress={() => setEditing(editing?.id === d.id ? null : d)}
              onRestore={() => save7(d, { active: true }, save)}
            />
          </View>
        ))}
      </Block>

      <ErrorText error={error} />

      <DutyForm
        key={editing?.id ?? 'new'}
        duty={editing}
        mates={mates.map((m) => ({ value: m.id, label: m.display_name.split(' ')[0] }))}
        busy={busy}
        onCancel={() => setEditing(null)}
        onSave={save}
      />
    </Screen>
  );
}

type Payload = {
  name: string;
  effort_points: number;
  every_days: number | null;
  weekdays: number[] | null;
  schedule: 'rolling' | 'fixed';
  fixed_member_id: string | null;
  active: boolean;
};

/** Restore keeps every other column exactly as it is, so one changed field still sends all seven. */
const save7 = (d: DutyRow, change: Partial<Payload>, save: (p: Payload, id: string) => void) =>
  save(
    {
      name: d.name,
      effort_points: d.effort_points,
      every_days: d.every_days,
      weekdays: d.weekdays,
      schedule: d.schedule,
      fixed_member_id: d.fixed_member_id,
      active: d.active,
      ...change,
    },
    d.id,
  );

function DutyLine({
  duty,
  mate,
  picked,
  busy,
  onPress,
  onRestore,
}: {
  duty: DutyRow;
  mate: string | null;
  picked: boolean;
  busy: boolean;
  onPress: () => void;
  onRestore: () => void;
}) {
  const c = usePalette();
  const sub = `${cadenceLabel(duty)}${mate ? ` · ${mate}` : duty.schedule === 'fixed' ? ' · fixed' : ''}`;
  // Retired rows stay in muted ink rather than behind an opacity, so they keep their contrast.
  const fg = duty.active ? c.ink : c.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: picked }}
        accessibilityLabel={`${duty.name}, ${duty.effort_points} points, ${sub}${duty.active ? '' : ', retired'} · edit`}
        onPress={onPress}
        style={({ pressed }) => [
          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
          pressed && { opacity: 0.6 },
        ]}>
        <View style={{ minWidth: 38, borderRadius: 11, paddingVertical: 2, backgroundColor: c.raised }}>
          <T size={12} num color={fg} center>
            {duty.effort_points}
          </T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T size={16} weight="700" color={fg} numberOfLines={1}>
            {duty.name}
            {duty.active ? '' : ' · Retired'}
          </T>
          <T size={13} soft>
            {sub}
          </T>
        </View>
      </Pressable>
      {!duty.active && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${duty.name} · restore`}
          disabled={busy}
          onPress={onRestore}
          style={({ pressed }) => [
            {
              minHeight: 48,
              justifyContent: 'center',
              paddingHorizontal: 14,
              borderRadius: 24,
              borderWidth: 1.5,
              borderColor: c.line,
            },
            pressed && { opacity: 0.6 },
          ]}>
          <T size={13} weight="700">
            Restore
          </T>
        </Pressable>
      )}
    </View>
  );
}

function DutyForm({
  duty,
  mates,
  busy,
  onCancel,
  onSave,
}: {
  duty: DutyRow | null;
  mates: { value: string; label: string }[];
  busy: boolean;
  onCancel: () => void;
  onSave: (p: Payload, id: string | null) => void;
}) {
  const [text, setText] = useState(duty?.name ?? '');
  const [points, setPoints] = useState(String(duty?.effort_points ?? 1));
  const [mode, setMode] = useState<'weekdays' | 'days'>(duty?.weekdays ? 'weekdays' : 'days');
  const [weekdays, setWeekdays] = useState<number[]>(duty?.weekdays ?? []);
  const [everyDays, setEveryDays] = useState(String(duty?.every_days ?? 1));
  const [schedule, setSchedule] = useState<'rolling' | 'fixed'>(duty?.schedule ?? 'rolling');
  const [fixed, setFixed] = useState(duty?.fixed_member_id ?? '');
  const [active, setActive] = useState(duty?.active ?? true);

  const name = text.trim().replace(/\s+/g, ' ');
  const n = Number(everyDays);
  const cadenceOk = mode === 'weekdays' ? weekdays.length > 0 : Number.isInteger(n) && n >= 1 && n <= 90;
  const ok = name.length > 0 && cadenceOk && (schedule === 'rolling' || mates.some((m) => m.value === fixed));

  return (
    <Block>
      <SectionLabel>{duty ? `Edit ${duty.name}` : 'Add a duty'}</SectionLabel>
      <Field label="Name" value={text} onChangeText={setText} placeholder="Kitchen floor" maxLength={60} />

      <T size={15} weight="600" soft>
        Effort points
      </T>
      <Choice options={POINTS.map((p) => ({ value: p, label: p }))} value={points} onChange={setPoints} />

      <T size={15} weight="600" soft>
        How often
      </T>
      <Choice
        options={[
          { value: 'weekdays' as const, label: 'On weekdays' },
          { value: 'days' as const, label: 'Every N days' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'weekdays' ? (
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {WD.map((label, i) => (
            <Day
              key={label}
              label={label}
              on={weekdays.includes(i)}
              onPress={() => setWeekdays(weekdays.includes(i) ? weekdays.filter((w) => w !== i) : [...weekdays, i])}
            />
          ))}
        </View>
      ) : (
        <Field
          label="Every how many days? (1–90)"
          value={everyDays}
          onChangeText={setEveryDays}
          keyboardType="number-pad"
          maxLength={2}
        />
      )}

      <T size={15} weight="600" soft>
        Whose turn
      </T>
      <Choice
        options={[
          { value: 'rolling' as const, label: 'Rolling' },
          { value: 'fixed' as const, label: 'Always one mate' },
        ]}
        value={schedule}
        onChange={setSchedule}
      />
      {schedule === 'fixed' && <Choice options={mates} value={fixed} onChange={setFixed} />}

      <T size={15} weight="600" soft>
        Status
      </T>
      <Choice
        options={[
          { value: 'active' as const, label: 'Active' },
          { value: 'retired' as const, label: 'Retired' },
        ]}
        value={active ? 'active' : 'retired'}
        onChange={(v) => setActive(v === 'active')}
      />

      <T size={13} soft>
        {schedule === 'rolling'
          ? 'Rolling: each turn goes to whoever is furthest behind their fair share.'
          : 'Always one mate: this duty never rotates.'}{' '}
        Retiring stops new turns; the turns already done stay in everyone&apos;s points.
      </T>

      <MagnetButton
        label={busy ? 'Saving…' : duty ? 'Save duty' : 'Add duty'}
        color="brass"
        disabled={busy || !ok}
        onPress={() =>
          onSave(
            {
              name,
              effort_points: Number(points),
              // Exactly one cadence: the unused one must be null, never an empty array.
              every_days: mode === 'days' ? n : null,
              weekdays: mode === 'weekdays' ? [...weekdays].sort() : null,
              schedule,
              fixed_member_id: schedule === 'fixed' ? fixed : null,
              active,
            },
            duty?.id ?? null,
          )
        }
      />
      {duty && <MagnetButton label="Cancel" outline onPress={onCancel} />}
    </Block>
  );
}

/** A weekday toggle. kit's Choice is single-select and weekdays are a set, so this screen has one. */
function Day({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 48,
          borderRadius: 24,
          borderWidth: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? c.raised : 'transparent',
          borderColor: on ? c.ink : c.line,
        },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <T size={13} weight="700">
        {label.slice(0, 2)}
      </T>
    </Pressable>
  );
}
