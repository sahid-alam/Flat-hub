// The flat's duties. The LIST comes first: you add a duty roughly never and edit one every few
// weeks, so opening on an empty Add form had it backwards. Tapping a duty edits it; Add duty is its
// own button. Nobody can delete one — retiring sets active = false, so the points already earned
// keep pointing at something. See docs/DATA_MODEL.md ("Duties").
import { router } from 'expo-router';
import { View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { dutyLine } from '@/ui/duties';
import { Block, MagnetButton, Row, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

export default function ManageDuties() {
  const c = usePalette();
  const { duties, name, areas } = useHousehold();
  const active = duties.filter((d) => d.active);
  // By area, in the flat's order; anything unlabelled last. An area changes nothing about who does
  // what, so this is only the order the list reads in.
  const groups = [...areas.map((a) => ({ id: a.id as string | null, name: a.name })), { id: null, name: 'No area' }]
    .map((g) => ({
      ...g,
      rows: active.filter((d) => (d.area_id ?? null) === g.id || (g.id === null && !areas.some((a) => a.id === d.area_id))),
    }))
    .filter((g) => g.rows.length > 0);
  const lead = (id: string | null | undefined) => duties.find((d) => d.id === id && d.active);
  const retired = duties.filter((d) => !d.active);

  return (
    <Screen>
      <MagnetButton
        label="Add a duty"
        color="brass"
        icon={{ ios: 'plus', android: 'add' }}
        onPress={() => router.push('/duties/edit')}
      />

      <SectionLabel>{active.length === 1 ? 'The flat runs one' : `The flat runs ${active.length}`}</SectionLabel>
      {active.length === 0 && (
        <Block>
          <T soft>
            Nothing yet. Add the chores the six of you argue about — one mate at a time, or two together on the same
            day.
          </T>
        </Block>
      )}
      {groups.map((g) => (
        <View key={g.id ?? 'none'} style={{ gap: 8 }}>
          {groups.length > 1 && (
            <T size={13.5} weight="600" soft>
              {g.name}
            </T>
          )}
          <Block style={{ gap: 0, paddingVertical: 4 }}>
            {g.rows.map((d, i) => (
              <View key={d.id}>
                {i > 0 && <Rule />}
                <Row label={d.name} detail={null} onPress={() => router.push(`/duties/edit?id=${d.id}`)} />
                <T size={13} soft style={{ paddingBottom: 8 }}>
                  {lead(d.follows_id) ? `Comes with ${lead(d.follows_id)!.name} · ` : ''}
                  {dutyLine(d, name)}
                </T>
              </View>
            ))}
          </Block>
        </View>
      ))}
      {active.length > 0 && (
        <T size={13} soft>
          Tap one to edit it.
        </T>
      )}

      {retired.length > 0 && (
        <>
          <SectionLabel>Retired</SectionLabel>
          <Block style={{ gap: 0, paddingVertical: 4 }}>
            {retired.map((d, i) => (
              <View key={d.id}>
                {i > 0 && <Rule />}
                <Row
                  label={d.name}
                  detail={null}
                  onPress={() => router.push(`/duties/edit?id=${d.id}`)}
                />
                <T size={13} color={c.muted} style={{ paddingBottom: 8 }}>
                  Stopped · its old turns stay in everyone&apos;s points
                </T>
              </View>
            ))}
          </Block>
          <T size={13} soft>
            A duty is retired, never deleted: deleting one would rewrite history the points were earned from.
          </T>
        </>
      )}
    </Screen>
  );
}
