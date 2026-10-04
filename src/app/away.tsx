import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { addedLate, isClosed, istDate, position, presenceWeights } from '@/domain/kitty';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { insertOnce, supabase } from '@/lib/supabase';
import { confirm, dayLabel, monthLabel, sayError, thisMonth, today } from '@/lib/util';
import { Block, Chip, DateField, ErrorText, MagnetButton, Position, Rule, Screen, SectionLabel, T, usePalette } from '@/ui/kit';

/** Log an absence, and see where every mate stands. Names in alphabetical order: no ranking. */
export default function Away() {
  const c = usePalette();
  const { me, members, absences, household, books, closes, name, holder, reload } = useHousehold();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a refusal belongs in the row that was tapped, not at the top of a block that may be scrolled past
  const [removeError, setRemoveError] = useState<{ id: string; message: string } | null>(null);
  const month = thisMonth();
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  const w = presenceWeights(month, books.members, books.absences);
  const mates = [...members].sort((a, b) => a.display_name.localeCompare(b.display_name));
  // both ends: an absence can straddle 28 Sep - 3 Oct. A closed month refuses the delete, so don't offer it.
  const frozen = (a: { from_date: string; to_date: string }) =>
    isClosed(a.from_date.slice(0, 7), closes ?? []) || isClosed(a.to_date.slice(0, 7), closes ?? []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await insertOnce('member_absence', { id: newId(), household_id: household.id, member_id: me.id, from_date: from, to_date: to });
      await reload();
      setFrom(today());
      setTo(today());
    } catch (e) {
      setError(sayError(e, holder?.display_name));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <Block>
        <SectionLabel>I'm away</SectionLabel>
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
        <MagnetButton label={busy ? 'Saving…' : 'Log my absence'} color="brass" disabled={busy || days < 1} onPress={save} />
      </Block>

      <Block>
        <SectionLabel>Where everyone stands</SectionLabel>
        <View>
          {mates.map((m, i) => (
            <View key={m.id}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <T weight="600">{m.id === me.id ? `${m.display_name} (me)` : m.display_name}</T>
                  <T size={13} soft>
                    {w[m.id] ?? 0} days in {monthLabel(month)}
                  </T>
                </View>
                <Position paise={position(books, m.id)} size={20} />
              </View>
            </View>
          ))}
        </View>
        <T size={13} soft>
          + is what they get back from the kitty; − is covered by their next top-up.
        </T>
      </Block>

      <Block>
        <SectionLabel>Absences</SectionLabel>
        {absences.length === 0 ? (
          <T soft>No one's logged an absence.</T>
        ) : (
          <View>
            {absences.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12, paddingVertical: 6 }}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <T weight="600">{name(a.member_id)}</T>
                    <T size={15} soft>
                      {dayLabel(a.from_date)} – {dayLabel(a.to_date)}
                    </T>
                    {addedLate(a) && <Chip kind="late" label={`added late · ${dayLabel(istDate(a.created_at))}`} />}
                  </View>
                  {a.member_id === me.id &&
                    (frozen(a) ? (
                      <Chip kind="late" label="closed" />
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove absence ${dayLabel(a.from_date)} – ${dayLabel(a.to_date)}`}
                        onPress={async () => {
                          if (!(await confirm('Remove this absence?', `${dayLabel(a.from_date)} – ${dayLabel(a.to_date)}`, 'Remove'))) return;
                          setRemoveError(null);
                          // the backstop for a race: the month was closed between the render and the tap
                          const { error } = await supabase.from('member_absence').delete().eq('id', a.id);
                          if (error) return setRemoveError({ id: a.id, message: sayError(error, holder?.display_name) });
                          reload();
                        }}
                        style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
                        <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 9 }}>
                          <T size={15} weight="700">
                            Remove
                          </T>
                        </View>
                      </Pressable>
                    ))}
                </View>
                {removeError?.id === a.id && (
                  <View role="status" style={{ backgroundColor: c.warnBg, borderRadius: 14, padding: 10, marginBottom: 8 }}>
                    <T size={13} weight="600" color={c.warnFg}>
                      {removeError.message}
                    </T>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </Block>
    </Screen>
  );
}
