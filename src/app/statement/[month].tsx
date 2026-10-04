import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { addedLate, istDate, presenceWeights, shares } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { dayLabel } from '@/lib/util';
import { ActivitySlip, feed } from '@/ui/activity';
import { Block, Chip, Hero, Icon, MonthCard, Rule, Screen, SectionLabel, T, usePalette, type BlockTone } from '@/ui/kit';
import { daysIn, monthName, monthRows, statusFor, toneFor } from '@/ui/statement';

/** One month, read-only and the same for every mate. */
export default function MonthStatement() {
  const { month = '' } = useLocalSearchParams<{ month: string }>();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return (
      <Screen>
        <T soft>There is no statement for that month.</T>
      </Screen>
    );
  }
  return <Detail month={month} />;
}

const DAYS_W = 76;
const SHARE_W = 100;

function Detail({ month }: { month: string }) {
  const c = usePalette();
  const { spends, entries, absences, members, books, me } = useHousehold();
  const { monthSpends, monthEntries, spent } = monthRows(spends, entries, month);
  const monthShares = shares({ ...books, spends: monthSpends });
  const w = presenceWeights(month, books.members, books.absences);
  const monthAbsences = absences.filter((a) => a.from_date.slice(0, 7) <= month && a.to_date.slice(0, 7) >= month);
  const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const put = total(monthEntries.filter((e) => e.kind === 'contribution').map((e) => e.amount_paise));
  const back = total(monthEntries.filter((e) => e.kind === 'reimbursement').map((e) => e.amount_paise));
  const fromPool = total(monthSpends.filter((s) => s.paid_from === 'pool').map((s) => s.total_paise));
  const ownPocket = total(monthSpends.filter((s) => s.paid_from === 'personal').map((s) => s.total_paise));
  const zepto = total(monthSpends.filter((s) => s.source === 'zepto').map((s) => s.total_paise));
  const mates = members.filter((m) => m.id in w); // members that month; later joiners don't get a 0-day row

  const name = monthName(month);
  const short = name.slice(0, 3);
  const days = daysIn(month);
  const status = statusFor(month);
  const split: { label: string; paise: number; tone: BlockTone }[] = [
    { label: 'Zepto', paise: zepto, tone: 'stone' },
    { label: monthSpends.some((s) => s.source === 'other') ? 'Local & other' : 'Local', paise: spent - zepto, tone: 'raised' },
  ];
  const pct = (p: number) => `${Math.round((p * 100) / spent)}%`;

  return (
    <Screen>
      <Stack.Screen options={{ title: `${name} ${month.slice(0, 4)}` }} />
      <MonthCard month={name} pill={`1–${days} ${short} · ${days} days`} status={status} tone={toneFor(month)} />

      <Block>
        <SectionLabel>Spent</SectionLabel>
        <Hero paise={spent} size={56} />
        <T size={13} soft>
          Pool and own-pocket spends, shared by days present.
        </T>
        {spent > 0 && (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {split.map((s) => (
                <Block
                  key={s.tone}
                  tone={s.tone}
                  accessibilityLabel={`${s.label} ${formatINR(s.paise)}, ${pct(s.paise)}`}
                  style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 20, gap: 2 }}>
                  <T size={13} weight="700">
                    {s.label}
                  </T>
                  <T num size={22} numberOfLines={1}>
                    {formatINR(s.paise)}
                  </T>
                  <T size={13} weight="700" soft>
                    {pct(s.paise)}
                  </T>
                </Block>
              ))}
            </View>
            <View aria-hidden style={{ flexDirection: 'row', gap: 3, height: 12 }}>
              {split.map((s) => (
                // `raised` is a card step, too close to this block to read as a 12px bar: the line token stands in for it.
                <View
                  key={s.tone}
                  style={{ flex: Math.max(0, s.paise), borderRadius: 6, backgroundColor: s.tone === 'raised' ? c.line : c[s.tone] }}
                />
              ))}
            </View>
          </>
        )}
      </Block>

      <Block style={{ gap: 0 }}>
        <SectionLabel>Shares · by days present</SectionLabel>
        <View role="table" aria-label={`${name} shares`} style={{ marginTop: 8 }}>
          <View role="row" style={{ flexDirection: 'row', paddingBottom: 8 }}>
            {['Mate', 'Days', 'Share'].map((h, i) => (
              <View
                key={h}
                role="columnheader"
                style={i === 0 ? { flex: 1 } : i === 1 ? { width: DAYS_W } : { width: SHARE_W, alignItems: 'flex-end' }}>
                <SectionLabel>{h}</SectionLabel>
              </View>
            ))}
          </View>
          {mates.map((m) => {
            const away = monthAbsences.filter((a) => a.member_id === m.id);
            const present = w[m.id];
            return (
              <View
                key={m.id}
                role="row"
                style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 8, borderTopWidth: 1, borderColor: c.hair }}>
                <View role="rowheader" style={{ flex: 1, gap: 4, paddingRight: 8 }}>
                  <T size={16} weight="600">
                    {m.display_name}
                    {m.id === me.id ? ' · you' : ''}
                  </T>
                  {away.map((a) => (
                    <View key={a.id} style={{ gap: 4 }}>
                      <T size={13} soft>
                        Away {dayLabel(a.from_date)} – {dayLabel(a.to_date)}
                      </T>
                      {addedLate(a) && <Chip kind="late" label={`added late, on ${dayLabel(istDate(a.created_at))}`} />}
                    </View>
                  ))}
                </View>
                <View role="cell" style={{ width: DAYS_W }}>
                  <T size={15} soft={present === days}>
                    {present} of {days}
                  </T>
                </View>
                <View role="cell" style={{ width: SHARE_W }}>
                  <T num size={16} style={{ textAlign: 'right' }}>
                    {formatINR(monthShares[m.id] ?? 0)}
                  </T>
                </View>
              </View>
            );
          })}
          <View
            role="row"
            style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, borderTopWidth: 1.5, borderColor: c.line }}>
            <View role="rowheader" style={{ flex: 1 }}>
              <T size={16} weight="700">
                Total
              </T>
            </View>
            <View role="cell" style={{ width: SHARE_W }}>
              <T num size={16} style={{ textAlign: 'right' }}>
                {formatINR(total(Object.values(monthShares)))}
              </T>
            </View>
          </View>
        </View>
        <T size={13} soft>
          Split by days present; only absences of 3 or more days count.
        </T>
      </Block>

      <Block style={{ gap: 0 }}>
        {(
          [
            ['Put in', put],
            ['Spent from the kitty', fromPool],
            ['Spent from own pockets', ownPocket],
            ['Paid back', back],
          ] as const
        ).map(([label, paise], i) => (
          <View key={label}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52 }}>
              <T>{label}</T>
              <T num>{formatINR(paise)}</T>
            </View>
          </View>
        ))}
      </Block>

      <Block style={{ gap: 0 }}>
        <SectionLabel>Entries · {monthSpends.length + monthEntries.length}</SectionLabel>
        {monthSpends.length + monthEntries.length === 0 ? (
          <T soft style={{ marginTop: 12 }}>
            Nothing recorded this month.
          </T>
        ) : (
          feed(monthSpends, monthEntries).map((item) => (
            <ActivitySlip key={(item.spend ?? item.entry)!.id} item={item} readOnly />
          ))
        )}
      </Block>

      <View
        style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name={{ ios: 'lock', android: 'lock' }} size={14} color={c.muted} />
        <T size={13} soft>
          Read-only · {status === 'closed' ? 'closed' : `closes ${days} ${short}`}
        </T>
      </View>
    </Screen>
  );
}
