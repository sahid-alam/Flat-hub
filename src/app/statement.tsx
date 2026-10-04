import { router } from 'expo-router';
import { Fragment, useState } from 'react';

import { closableMonths } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { confirm, monthOf, sayError, shiftMonth, thisMonth } from '@/lib/util';
import { Block, ErrorText, MagnetButton, MonthCard, Screen, SectionLabel, T } from '@/ui/kit';
import { monthName, monthRows, statusFor, toneFor } from '@/ui/statement';

/** Every month from the first spend or entry to now, newest first, as a stack of month cards. */
export default function Statements() {
  const { spends, entries, books, closes, household, isTreasurer, reload } = useHousehold();
  const now = thisMonth();
  const first = [...spends, ...entries].map((r) => monthOf(r.occurred_at)).reduce((a, b) => (b < a ? b : a), now);
  const months: string[] = [];
  for (let m = now; m >= first; m = shiftMonth(m, -1)) months.push(m);
  // closes === null: the month_close table isn't there yet, so nothing can be closed
  const closable = isTreasurer && closes ? closableMonths(books, closes, new Date().toISOString())[0] : undefined;

  return (
    <Screen>
      {closable && <CloseMonth month={closable} householdId={household.id} onClosed={reload} />}
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
              status={statusFor(month, closes ?? [])}
              tone={toneFor(month)}
              onPress={() => router.push({ pathname: '/statement/[month]', params: { month } })}
            />
          </Fragment>
        );
      })}
    </Screen>
  );
}

/** The treasurer's close action, on the oldest month that is over and still open. */
function CloseMonth({ month, householdId, onClosed }: { month: string; householdId: string; onClosed: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = monthName(month);
  const full = `${short} ${month.slice(0, 4)}`;

  async function close() {
    const ok = await confirm(
      `Close ${full}?`,
      `Absences, spends and top-ups dated in ${short} can no longer be added or removed, so everyone's share is final.\n\nReversing an entry still works, and you can reopen the month.`,
      `Close ${short}`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('close_month', { p_id: newId(), p_household_id: householdId, p_month: month });
    if (error) setError(sayError(error));
    else await onClosed();
    setBusy(false);
  }

  return (
    <Block>
      <SectionLabel>Close a month</SectionLabel>
      <T size={15} soft>
        {full} is over. Closing it makes the statement the flat's record: after that no one can add or remove an absence, a
        spend or a top-up dated in {short}.
      </T>
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Closing…' : `Close ${short}`}
        icon={{ ios: 'lock', android: 'lock' }}
        disabled={busy}
        onPress={close}
      />
    </Block>
  );
}
