import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { addedLate, istDate, presenceWeights, shares } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { dayLabel, monthLabel, monthOf, shiftMonth, thisMonth } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import { DISPLAY, Heading, Icon, Rule, Screen, Slip, T, usePalette } from '@/ui/kit';

/** Read-only month statement, the same for every mate. */
export default function Statement() {
  const c = usePalette();
  const { spends, entries, absences, members, books, name } = useHousehold();
  const [month, setMonth] = useState(thisMonth());

  // a reversal belongs to its target's month, exactly as the share maths allocates it
  const byId = new Map(spends.map((s) => [s.id, s]));
  const anchor = (s: (typeof spends)[number]) => monthOf((s.reverses_id ? byId.get(s.reverses_id) ?? s : s).occurred_at);
  const monthSpends = spends.filter((s) => anchor(s) === month);
  const monthEntries = entries.filter((e) => monthOf(e.occurred_at) === month);
  const monthShares = shares({ ...books, spends: monthSpends });
  const w = presenceWeights(month, books.members, books.absences);
  const monthAbsences = absences.filter((a) => a.from_date.slice(0, 7) <= month && a.to_date.slice(0, 7) >= month);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const put = total(monthEntries.filter((e) => e.kind === 'contribution').map((e) => e.amount_paise));
  const back = total(monthEntries.filter((e) => e.kind === 'reimbursement').map((e) => e.amount_paise));
  const fromPool = total(monthSpends.filter((s) => s.paid_from === 'pool').map((s) => s.total_paise));
  const ownPocket = total(monthSpends.filter((s) => s.paid_from === 'personal').map((s) => s.total_paise));
  const isCurrent = month === thisMonth();

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Arrow by={-1} label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
        <View style={{ alignItems: 'center' }}>
          <T size={28} style={{ fontFamily: DISPLAY, lineHeight: 34 }}>
            {monthLabel(month)}
          </T>
          {isCurrent && (
            <T size={13} soft>
              provisional until the month closes
            </T>
          )}
        </View>
        <Arrow by={1} label="Next month" disabled={isCurrent} onPress={() => setMonth(shiftMonth(month, 1))} />
      </View>

      <Slip>
        {[
          ['Put in', put, c.green],
          ['Spent from the kitty', fromPool, c.tomato],
          ['Spent from own pockets', ownPocket, c.tomato],
          ['Paid back', back, c.blue],
        ].map(([label, paise, color], i) => (
          <View key={label as string}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, alignItems: 'center' }}>
              <T>{label as string}</T>
              <T weight="700" color={color as string}>
                {formatINR(paise as number)}
              </T>
            </View>
          </View>
        ))}
      </Slip>

      <Heading>Shares</Heading>
      <Slip>
        {members.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, alignItems: 'center' }}>
              <View>
                <T weight="600">{m.display_name}</T>
                <T size={15} soft>
                  {w[m.id] ?? 0} days present
                </T>
              </View>
              <T weight="600">{formatINR(monthShares[m.id] ?? 0)}</T>
            </View>
          </View>
        ))}
        <T size={13} soft>
          The month's spend is split by days present; absences of 3+ days count.
        </T>
      </Slip>

      <Heading>Entries</Heading>
      {monthSpends.length + monthEntries.length === 0 ? (
        <T soft>Nothing recorded this month.</T>
      ) : (
        <Slip>
          {feed(monthSpends, monthEntries).map((item) => (
            <ActivitySlip key={(item.spend ?? item.entry)!.id} item={item} readOnly />
          ))}
        </Slip>
      )}

      {monthAbsences.length > 0 && (
        <>
          <Heading>Absences</Heading>
          <Slip>
            {monthAbsences.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <Rule />}
                <View style={{ minHeight: 52, justifyContent: 'center' }}>
                  <T weight="600">
                    {name(a.member_id)} · {dayLabel(a.from_date)} – {dayLabel(a.to_date)}
                  </T>
                  {addedLate(a) && (
                    <T size={15} weight="600" color={c.orange}>
                      added late, on {dayLabel(istDate(a.created_at))}
                    </T>
                  )}
                </View>
              </View>
            ))}
          </Slip>
        </>
      )}
    </Screen>
  );
}

function Arrow({ by, label, disabled, onPress }: { by: number; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }}>
      <Icon name={by < 0 ? { ios: 'chevron.left', android: 'chevron_left' } : { ios: 'chevron.right', android: 'chevron_right' }} />
    </Pressable>
  );
}
