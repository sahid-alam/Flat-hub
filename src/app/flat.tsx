// The occasional things, behind the Kitty header's people button: away, to reimburse, mates, favourites
// and the treasurer's record-a-top-up. None of them is a daily job, so none of them earns a tab.
import { router } from 'expo-router';

import { toGetBack, toPay } from '@/domain/bills';
import { unreimbursed } from '@/domain/kitty';
import { formatINR } from '@/domain/money';
import { useHousehold } from '@/lib/books';
import { today } from '@/lib/util';
import { Block, Row, Rule, Screen, T } from '@/ui/kit';

export default function Flat() {
  const { members, spends, entries, absences, products, bills, billShares, billPayments, me } = useHousehold();
  const owed = unreimbursed(spends, entries);
  const now = today();
  const away = absences.filter((a) => a.from_date <= now && now <= a.to_date);
  const favourites = products.filter((p) => p.favourite);
  // bills are their own ledger: what you owe other mates and what they owe you, never the kitty
  const billsPay = toPay(bills, billShares, billPayments, me.id);
  const billsBack = toGetBack(bills, billShares, billPayments, me.id);
  const billsDetail = billsPay || billsBack
    ? [billsPay && `pay ${formatINR(billsPay)}`, billsBack && `get back ${formatINR(billsBack)}`].filter(Boolean).join(' · ')
    : bills.length
      ? 'all settled'
      : 'none yet';

  return (
    <Screen>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        {/* Your own things live on Profile; everything below this row is the flat's business. Until
            the nav puts an avatar in the home header, this is the door to it. */}
        <Row
          label="Your profile"
          icon={{ ios: 'person.crop.circle', android: 'account_circle' }}
          detail="UPI ID, photo, notifications"
          onPress={() => router.push('/profile')}
        />
        <Rule />
        <Row
          label="Away"
          icon={{ ios: 'airplane', android: 'flight' }}
          detail={away.length ? `${away.length} away` : 'everyone here'}
          onPress={() => router.push('/away')}
        />
        <Rule />
        <Row
          label="To reimburse"
          icon={{ ios: 'arrow.uturn.left', android: 'undo' }}
          detail={owed.length ? `${owed.length} · ${formatINR(owed.reduce((a, s) => a + s.total_paise, 0))}` : 'none'}
          onPress={() => router.push('/reimburse')}
        />
        <Rule />
        <Row
          label="Bills"
          icon={{ ios: 'bolt', android: 'bolt' }}
          detail={billsDetail}
          onPress={() => router.push('/bills')}
        />
        <Rule />
        <Row
          label="Mates"
          icon={{ ios: 'person.2', android: 'group' }}
          detail={String(members.length)}
          onPress={() => router.push('/mates')}
        />
        <Rule />
        <Row
          label="Favourites"
          icon={{ ios: 'star', android: 'star' }}
          detail={favourites.length ? String(favourites.length) : 'none yet'}
          onPress={() => router.push('/favourites')}
        />
        <Rule />
        {/* The Kitty's Statements block went with the link pile; Spending's archive is the main
            doorway, but /statement is where a month gets closed, so it keeps one here too. */}
        <Row
          label="Statements"
          icon={{ ios: 'doc.text', android: 'description' }}
          detail="month by month"
          onPress={() => router.push('/statement')}
        />
        <Rule />
        {/* The one door onto the permission prompt. It has to be a deliberate visit, because the
            prompt may only come from a tap and a refusal cannot be asked again. */}
        <Row
          label="Notifications"
          icon={{ ios: 'bell', android: 'notifications' }}
          onPress={() => router.push('/notifications')}
        />
        <Rule />
        <Row
          label="Record a top-up"
          icon={{ ios: 'indianrupeesign', android: 'currency_rupee' }}
          onPress={() => router.push('/topup')}
        />
      </Block>
      <T size={13} soft>
        Your own top-up, the quick add and the recent feed stay on the Kitty tab. Your name, UPI ID, photo and
        notification settings are on Profile.
      </T>
    </Screen>
  );
}
