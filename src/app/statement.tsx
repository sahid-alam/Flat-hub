import { router } from 'expo-router';
import { Fragment } from 'react';

import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { monthOf, shiftMonth, thisMonth } from '@/lib/util';
import { MonthCard, Screen, SectionLabel } from '@/ui/kit';
import { monthName, monthRows, statusFor, toneFor } from '@/ui/statement';

/** Every month from the first spend or entry to now, newest first, as a stack of month cards. */
export default function Statements() {
  const { spends, entries } = useHousehold();
  const now = thisMonth();
  const first = [...spends, ...entries].map((r) => monthOf(r.occurred_at)).reduce((a, b) => (b < a ? b : a), now);
  const months: string[] = [];
  for (let m = now; m >= first; m = shiftMonth(m, -1)) months.push(m);

  return (
    <Screen>
      {months.map((month, i) => {
        // ponytail: rescans every row per month; fine for years of a 6-person flat
        const { monthSpends, monthEntries, spent } = monthRows(spends, entries, month);
        const n = monthSpends.length + monthEntries.length;
        const year = month.slice(0, 4);
        return (
          <Fragment key={month}>
            {(i === 0 || months[i - 1].slice(0, 4) !== year) && <SectionLabel>{year}</SectionLabel>}
            <MonthCard
              month={monthName(month)}
              pill={`${formatINR(spent)} · ${n} ${n === 1 ? 'entry' : 'entries'}`}
              status={statusFor(month)}
              tone={toneFor(month)}
              onPress={() => router.push({ pathname: '/statement/[month]', params: { month } })}
            />
          </Fragment>
        );
      })}
    </Screen>
  );
}
