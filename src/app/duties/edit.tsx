// Add or edit one duty. Every setting is a row that READS BACK its answer ("Every day", "2 points",
// "Kitchen"), and tapping a row opens a sheet that asks that one question. A sheet covers; it never
// pushes, so the rows underneath stay where they were and Save, pinned at the bottom, never moves.
// Below the rows it PRINTS THE ROTA it is about to make, so the consequence of "two people" and
// "who's in" is visible rather than described.
//
// Reordering the rota lives in the Who sheet, behind an explicit Edit. That is "I can't have Monday
// because of college, I can do Tuesday" — a permanent change to who comes first. It is NOT the same
// feature as offering one instance, which lives on the Duties tab and happens once.
//
// Area and Comes with look alike and are deliberately two rows (20261014175243): an area is a LABEL
// for reading and decides nothing; "comes with" decides WHO on days both duties are due, never
// whether either is done or what it earns.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';

import { useHousehold, type DutyRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { confirm, sayError } from '@/lib/util';
import { cadenceLabel, previewRota } from '@/ui/duties';
import { Stack } from '@/ui/stack';
import {
  Block,
  Choice,
  ErrorText,
  Field,
  Icon,
  MagnetButton,
  Row,
  Rule,
  Screen,
  SectionLabel,
  Sheet,
  T,
  usePalette,
} from '@/ui/kit';

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
type Question = 'often' | 'worth' | 'who' | 'area' | 'with' | 'brings';

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
  area_id: string | null;
  follows_id: string | null;
};

const cadenceOf = (d: DutyRow | null): Cadence =>
  !d ? 'd1' : d.weekdays ? 'wd' : d.every_days === 1 ? 'd1' : d.every_days === 2 ? 'd2' : d.every_days === 7 ? 'd7' : 'dn';

export default function EditDuty() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { duties, members, household, areas, reload, name: nameOf } = useHousehold();
  const duty = duties.find((d) => d.id === id) ?? null;
  const mates = members.filter((m) => !m.left_on);
  const c = usePalette();

  // Minted once per form, so a retried Add after a lost response is a no-op rather than a twin.
  const [newDutyId] = useState(newId);
  const selfId = duty?.id ?? newDutyId;
  // Retired followers stay in the list: set_duty_followers unlinks whatever is left out of it.
  const [linkedBefore] = useState(() => duties.filter((d) => duty && d.follows_id === duty.id).map((d) => d.id));

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
  const [areaId, setAreaId] = useState<string | null>(duty?.area_id ?? null);
  const [follows, setFollows] = useState<string | null>(duty?.follows_id ?? null);
  const [followers, setFollowers] = useState<string[]>(linkedBefore);
  const [open, setOpen] = useState<Question | null>(null);
  const [reorder, setReorder] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = text.trim().replace(/\s+/g, ' ');
  const n = Number(everyDays);
  const nOk = Number.isInteger(n) && n >= 1 && n <= 90;
  const group = Number(size);
  const inRoster = roster.filter((rid) => mates.some((m) => m.id === rid));
  const cadenceOk = cadence === 'wd' ? weekdays.length > 0 : cadence === 'dn' ? nOk : true;
  const fixed = duty?.schedule === 'fixed';
  const leader = follows ? duties.find((d) => d.id === follows) : undefined;
  const others = duties.filter((d) => d.active && d.id !== selfId);
  // One level deep, the same two rules the trigger holds (20261014175243). A duty that brings others
  // along cannot itself come with one, and a fixed duty ("always Ansh") cannot come with anything.
  const leaders = others.filter((d) => !d.follows_id);
  const hasLeaderOf = (d: DutyRow) => duties.some((x) => x.follows_id === d.id);
  const canFollow = !fixed && followers.length === 0;
  const canBring = follows === null;
  const bringable = others.filter((d) => d.schedule === 'rolling' && !hasLeaderOf(d));
  const unbringable = others.filter((d) => d.schedule !== 'rolling' || hasLeaderOf(d));

  // The button says what is missing rather than sitting grey and silent (DESIGN.md rule 2).
  const blocker = !name.length
    ? 'Name the duty first'
    : !cadenceOk
      ? cadence === 'wd'
        ? 'Pick at least one weekday'
        : 'Pick 1 to 90 days'
      : !follows && inRoster.length < group
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
    // A follower's crew is its leader's, so it keeps no roster (duty_follows_no_roster). Otherwise
    // everybody, in member order, is the same as no roster — store null so the duty follows the flat
    // as mates come and go.
    roster:
      follows || (inRoster.length === mates.length && inRoster.every((rid, i) => rid === mates[i].id))
        ? null
        : inRoster,
    area_id: areaId,
    follows_id: follows,
  });

  async function setLinks(list: string[]) {
    const { error: e } = await supabase.rpc('set_duty_followers', { p_duty: selfId, p_followers: list });
    if (e) throw e;
  }

  async function save(change: Partial<Payload> = {}) {
    setBusy(true);
    setError(null);
    try {
      const row = { ...payload(), ...change };
      const bring = row.follows_id ? [] : followers;
      const relink = bring.length !== linkedBefore.length || bring.some((f) => !linkedBefore.includes(f));
      // Order matters only for the trigger: a duty must shed its followers before it can follow, and
      // must stop following before it can bring others. Each step alone leaves a valid flat behind.
      if (duty) {
        if (row.follows_id && relink) await setLinks([]);
        // Exactly the granted columns: anything else is a column-level permission denied.
        const { error: e } = await supabase.from('duty').update(row).eq('id', duty.id);
        if (e) throw e;
        if (!row.follows_id && relink) await setLinks(bring);
      } else {
        await insertOnce('duty', { id: selfId, household_id: household.id, ...row });
        if (bring.length) await setLinks(bring);
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
    const brought = duties.filter((d) => d.active && d.follows_id === duty.id).map((d) => d.name);
    if (
      await confirm(
        `Retire ${duty.name}?`,
        'It stops coming round. Every turn already done keeps its points, and you can restore it from the list.' +
          (brought.length
            ? ` ${list(brought)} ${brought.length === 1 ? 'comes' : 'come'} with it, and will take ${brought.length === 1 ? 'its own turns' : 'their own turns'} instead.`
            : ''),
        'Retire it',
      )
    )
      await save({ active: false });
  }

  async function addArea() {
    const label = newArea.trim().replace(/\s+/g, ' ');
    if (!label) return;
    const existing = areas.find((a) => a.name.toLowerCase() === label.toLowerCase());
    if (existing) return (setAreaId(existing.id), setNewArea(''));
    setError(null);
    const areaRowId = newId();
    try {
      const position = Math.min(99, areas.reduce((m, a) => Math.max(m, a.position + 1), 0));
      await insertOnce('duty_area', { id: areaRowId, household_id: household.id, name: label, position });
      await reload();
      setAreaId(areaRowId);
      setNewArea('');
    } catch (e) {
      setError(sayError(e));
    }
  }

  // What these settings would actually produce, from a cold start. The rota is deterministic, so this
  // is the real thing and not an illustration.
  // Long enough for one full cycle: every mate in the roster, group_size at a time.
  const period = cadence === 'wd' ? 1 : cadence === 'dn' ? n : cadence === 'd7' ? 7 : Number(cadence.slice(1));
  const span = Math.min(28, Math.max(1, period) * Math.ceil(inRoster.length / Math.max(1, group)));
  const lines =
    !follows && cadenceOk && inRoster.length
      ? previewRota(
          {
            id: selfId,
            ...payload(),
            name: name || 'This duty',
            roster: inRoster,
            schedule: 'rolling',
            fixed_member_id: null,
            follows_id: null,
          },
          members,
          nameOf,
          span,
        )
      : [];

  const first = (rid: string) => nameOf(rid).split(' ')[0];
  const dutyName = (did: string) => duties.find((d) => d.id === did)?.name ?? 'a duty';
  const shownFollowers = followers.filter((f) => others.some((d) => d.id === f));
  const often = cadenceLabel({
    weekdays: cadence === 'wd' ? weekdays : null,
    every_days: cadence === 'dn' ? (nOk ? n : 0) : cadence === 'wd' ? null : Number(cadence.slice(1)),
  });
  const who = leader
    ? `With ${leader.name}`
    : fixed
      ? `Always ${duty?.fixed_member_id ? first(duty.fixed_member_id) : 'one mate'}`
      : `${group > 1 ? `${group} together, ` : ''}${inRoster.length === mates.length ? 'everyone' : `${inRoster.length} of ${mates.length}`} in turn`.replace(/^./, (x) => x.toUpperCase());

  return (
    <Screen
      footer={
        <>
          <ErrorText error={error} />
          <MagnetButton
            label={busy ? 'Saving…' : (blocker ?? (duty ? 'Save duty' : 'Add duty'))}
            color="brass"
            disabled={busy || blocker !== null}
            onPress={() => save()}
          />
        </>
      }>
      <Stack.Screen options={{ title: duty ? 'Edit duty' : 'Add a duty' }} />
      <Field label="Name" value={text} onChangeText={setText} placeholder="e.g. Terrace sweep" maxLength={60} />

      <SectionLabel>The duty</SectionLabel>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        <Row label="How often" detail={often} icon={{ ios: 'repeat', android: 'repeat' }} onPress={() => setOpen('often')} />
        <Rule />
        <Row
          label="Worth"
          detail={`${points} ${points === '1' ? 'point' : 'points'}${group > 1 ? ' each' : ''}`}
          icon={{ ios: 'star', android: 'star' }}
          onPress={() => setOpen('worth')}
        />
        <Rule />
        <Row label="Who does it" detail={who} icon={{ ios: 'person.2', android: 'group' }} onPress={() => setOpen('who')} />
        <Rule />
        <Row
          label="Area"
          detail={areas.find((a) => a.id === areaId)?.name ?? 'None'}
          icon={{ ios: 'square.grid.2x2', android: 'grid_view' }}
          onPress={() => setOpen('area')}
        />
      </Block>

      <SectionLabel>Goes together with</SectionLabel>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        {canFollow && (
          <>
            <Row
              label="Comes with"
              detail={leader?.name ?? 'Nothing'}
              icon={{ ios: 'link', android: 'link' }}
              onPress={() => setOpen('with')}
            />
            {canBring && <Rule />}
          </>
        )}
        {canBring && (
          <Row
            label="Brings along"
            detail={shownFollowers.length ? list(shownFollowers.map(dutyName)) : 'Nothing'}
            icon={{ ios: 'plus.square.on.square', android: 'library_add' }}
            onPress={() => setOpen('brings')}
          />
        )}
        <Rule />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
          <Icon name={{ ios: 'fork.knife', android: 'restaurant' }} size={22} color={c.muted} />
          <View style={{ flex: 1 }}>
            <T size={15.5} weight="600">
              Plans the meals
            </T>
            <T size={13} soft>
              Whoever has it tells the cook what to make
            </T>
          </View>
          <Switch
            accessibilityLabel="Plans the meals"
            value={meals}
            onValueChange={setMeals}
            trackColor={{ false: c.sunk, true: c.positive }}
            thumbColor={c.ink}
            // react-native-web ignores thumbColor when on and paints its own teal; this is its name for it.
            {...{ activeThumbColor: c.ink }}
          />
        </View>
      </Block>
      {fixed && followers.length === 0 && (
        <T size={13} soft>
          A duty that is always {duty?.fixed_member_id ? first(duty.fixed_member_id) : 'one mate'} can bring others along,
          but cannot come with another.
        </T>
      )}

      {leader ? (
        <Block tone="raised">
          <SectionLabel>So the rota comes out like this</SectionLabel>
          <T size={15} weight="600">
            On a day both are due, whoever does {leader.name} does this too.
          </T>
          <T size={13} soft>
            It stays its own duty: its own tick, its own {points === '1' ? 'point' : 'points'}. Doing {leader.name} never
            counts for it. On a day {leader.name} isn&apos;t due, it takes its own turn round the flat.
          </T>
        </Block>
      ) : (
        lines.length > 0 && (
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
              {shownFollowers.length > 0 &&
                ` On a day ${shownFollowers.length === 1 ? 'it is' : 'they are'} due too, ${list(shownFollowers.map(dutyName))} ${shownFollowers.length === 1 ? 'goes' : 'go'} with it.`}
            </T>
          </Block>
        )
      )}

      {duty?.active && <MagnetButton label="Retire this duty" outline disabled={busy} onPress={retire} />}
      {duty && !duty.active && (
        <MagnetButton label="Bring it back" outline disabled={busy} onPress={() => save({ active: true })} />
      )}

      {open === 'often' && (
        <Sheet title="How often" onClose={() => setOpen(null)}>
          <Choice label="How often" options={CADENCES.map((o) => ({ ...o }))} value={cadence} onChange={setCadence} />
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
        </Sheet>
      )}

      {open === 'worth' && (
        <Sheet title="What it's worth" onClose={() => setOpen(null)}>
          <Choice label="Points" options={POINTS.map((p) => ({ value: p, label: p }))} value={points} onChange={setPoints} />
          <T size={13} soft>
            Points per person, per turn. A heavier chore is worth more, so one bathroom clean can balance three bin runs.
          </T>
        </Sheet>
      )}

      {open === 'who' && (
        <Sheet title="Who does it" onClose={() => setOpen(null)}>
          <T size={13.5} weight="600" soft>
            How many at once
          </T>
          <Choice label="How many at once" options={SIZES.map((v) => ({ value: v, label: v }))} value={size} onChange={setSize} />
          {group > 1 && (
            <T size={13} soft>
              {group} mates do this duty <T size={13} weight="700">together, on the same day</T>. They are not taking
              turns. Each of them ticks their own turn and earns the points separately.
            </T>
          )}
          {leader ? (
            <T size={13} soft>
              This comes with {leader.name}, so it goes to whoever does {leader.name} that day
              {group > 1 ? ' — as many of them as this needs' : ' — the first of them, if two do it'}. To pick who&apos;s
              in yourself, set Comes with back to Nothing.
            </T>
          ) : (
            <>
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
                    onPress={() => setRoster(roster.includes(m.id) ? roster.filter((r) => r !== m.id) : [...roster, m.id])}
                  />
                ))}
              </View>
              {fixed && (
                <T size={13} soft>
                  This duty was set to always{' '}
                  {duty?.fixed_member_id ? first(duty.fixed_member_id) : 'one mate'} before the rework, and it keeps that.
                  Narrow &quot;who&apos;s in&quot; to one mate for the same thing.
                </T>
              )}
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
                            {first(rid)}
                          </T>
                          {/* ponytail: two buttons, not drag-and-drop. Dragging fights the row's own swipe,
                              needs a gesture provider at the root, and cannot be driven by a screen reader. */}
                          {reorder && (
                            <>
                              <Move
                                label={`Move ${first(rid)} up`}
                                icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up' }}
                                disabled={i === 0}
                                onPress={() => setRoster(swap(inRoster, i, i - 1))}
                              />
                              <Move
                                label={`Move ${first(rid)} down`}
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
                    &quot;I can&apos;t have Monday because of college, I can do Tuesday&quot; — move yourself down a row.
                    That is permanent, and it lives here. Offering one turn is a different thing and lives on the Duties
                    tab.
                  </T>
                </>
              )}
            </>
          )}
        </Sheet>
      )}

      {open === 'area' && (
        <Sheet title="Area" onClose={() => setOpen(null)}>
          <T size={13} soft>
            Groups duties on the Duties tab and in the list. It never changes who does what.
          </T>
          <Choice
            label="Area"
            options={[{ value: '', label: 'None' }, ...areas.map((a) => ({ value: a.id, label: a.name }))]}
            value={areaId ?? ''}
            onChange={(v) => setAreaId(v || null)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="A new area" value={newArea} onChangeText={setNewArea} placeholder="e.g. Terrace" maxLength={30} onSubmitEditing={addArea} />
            </View>
            <Day label="Add" on={false} onPress={addArea} role="button" a11yLabel="Add this area" />
          </View>
          <ErrorText error={error} />
        </Sheet>
      )}

      {open === 'with' && (
        <Sheet title="Comes with" onClose={() => setOpen(null)}>
          <T size={13} soft>
            On a day both are due, this goes to whoever does that duty — the same person, after any swap or absence.
            Each keeps its own tick and its own points.
          </T>
          <Choice
            label="Comes with"
            options={[{ value: '', label: 'Nothing' }, ...leaders.map((d) => ({ value: d.id, label: d.name }))]}
            value={follows ?? ''}
            onChange={(v) => setFollows(v || null)}
          />
        </Sheet>
      )}

      {open === 'brings' && (
        <Sheet title="Brings along" onClose={() => setOpen(null)}>
          <T size={13} soft>
            On a day both are due, whoever does {name || 'this duty'} does these too. Each keeps its own tick and its own
            points, so doing this one never counts for them.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {bringable.map((d) => (
              <Day
                key={d.id}
                label={d.name}
                on={followers.includes(d.id)}
                onPress={() =>
                  setFollowers(followers.includes(d.id) ? followers.filter((f) => f !== d.id) : [...followers, d.id])
                }
              />
            ))}
          </View>
          {bringable
            .filter((d) => followers.includes(d.id) && (d.roster || (d.follows_id && d.follows_id !== selfId)))
            .map((d) => (
              <T key={d.id} size={13} soft>
                {d.name}
                {d.follows_id && d.follows_id !== selfId ? ` stops coming with ${dutyName(d.follows_id)}` : ''}
                {d.follows_id && d.follows_id !== selfId && d.roster ? ', and' : ''}
                {d.roster ? ' drops its own who’s-in list' : ''}.
              </T>
            ))}
          {unbringable.length > 0 && (
            <T size={13} soft>
              Can&apos;t be brought along: {list(unbringable.map((d) => `${d.name} (${d.schedule !== 'rolling' ? 'always one mate' : 'others come with it'})`))}.
            </T>
          )}
        </Sheet>
      )}
    </Screen>
  );
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const swap = (xs: string[], a: number, b: number) => {
  const out = [...xs];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};

/** A toggle, 48pt. kit's Choice is single-select and weekdays, the roster and followers are sets. */
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
