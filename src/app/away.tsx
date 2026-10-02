import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { addedLate, istDate, position, presenceWeights } from '@/domain/kitty';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { confirm, dayLabel, monthLabel, thisMonth, today } from '@/lib/util';
import { DateField, ErrorText, Heading, MagnetButton, Position, Rule, Screen, Slip, T, usePalette } from '@/ui/kit';

/** Log an absence, and see where every mate stands. Names in flat order: no ranking. */
export default function Away() {
  const c = usePalette();
  const { me, members, absences, household, books, name, reload } = useHousehold();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const month = thisMonth();
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const w = presenceWeights(month, books.members, books.absences);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await insertOnce('member_absence', { id: newId(), household_id: household.id, member_id: me.id, from_date: from, to_date: to });
      await reload();
      setFrom(today());
      setTo(today());
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Slip magnet="blue">
        <T size={20} weight="700">
          I'm away
        </T>
        <DateField label="From" value={from} onChange={(d) => (setFrom(d), d > to && setTo(d))} />
        <DateField label="To" value={to} onChange={setTo} />
        <T size={15} soft>
          {days < 1
            ? 'The end date is before the start.'
            : days >= 3
              ? `${days} days: your share of ${monthLabel(month)}'s spend drops for these days.`
              : `${days} day${days > 1 ? 's' : ''}: trips under 3 days don't change shares (back-to-back entries add up).`}
        </T>
        <ErrorText error={error} />
        <MagnetButton label={busy ? 'Saving…' : 'Log my absence'} color="blue" disabled={busy || days < 1} onPress={save} />
      </Slip>

      <Heading>Where everyone stands</Heading>
      <Slip>
        {members.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="600">{m.id === me.id ? `${m.display_name} (me)` : m.display_name}</T>
                <T size={15} soft>
                  {w[m.id] ?? 0} days in {monthLabel(month)}
                </T>
              </View>
              <Position paise={position(books, m.id)} />
            </View>
          </View>
        ))}
        <T size={13} soft>
          + means the kitty owes them; − is what their next top-up covers.
        </T>
      </Slip>

      <Heading>Absences</Heading>
      {absences.length === 0 ? (
        <T soft>No one's logged an absence.</T>
      ) : (
        <Slip>
          {absences.map((a, i) => (
            <View key={a.id}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T weight="600">{name(a.member_id)}</T>
                  <T size={15} soft>
                    {dayLabel(a.from_date)} – {dayLabel(a.to_date)}
                    {addedLate(a) ? ` · added late (${dayLabel(istDate(a.created_at))})` : ''}
                  </T>
                </View>
                {a.member_id === me.id && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={async () => {
                      if (!(await confirm('Remove this absence?', `${dayLabel(a.from_date)} – ${dayLabel(a.to_date)}`, 'Remove'))) return;
                      await supabase.from('member_absence').delete().eq('id', a.id);
                      reload();
                    }}
                    style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'flex-end' }}>
                    <T size={15} weight="600" color={c.tomato}>
                      Remove
                    </T>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </Slip>
      )}
    </Screen>
  );
}
