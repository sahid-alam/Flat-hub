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
  const { duties, name } = useHousehold();
  const active = duties.filter((d) => d.active);
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
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        {active.length === 0 ? (
          <T soft style={{ paddingVertical: 12 }}>
            Nothing yet. Add the chores the six of you argue about — one mate at a time, or two together on the same
            day.
          </T>
        ) : (
          active.map((d, i) => (
            <View key={d.id}>
              {i > 0 && <Rule />}
              <Row label={d.name} detail={null} onPress={() => router.push(`/duties/edit?id=${d.id}`)} />
              <T size={13} soft style={{ paddingBottom: 8 }}>
                {dutyLine(d, name)}
              </T>
            </View>
          ))
        )}
      </Block>
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
