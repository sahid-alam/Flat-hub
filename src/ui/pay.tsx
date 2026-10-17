// Paying a mate through UPI. The app cannot see a UPI payment land, so "Mark as paid" stays the step
// that counts; this only saves typing the UPI ID and the amount. When the mate has no UPI ID saved, the
// button asks them for one instead of quietly not being there.
import { useState } from 'react';
import { Linking, Share } from 'react-native';

import { upiAmount } from '@/domain/money';
import { ErrorText, MagnetButton } from '@/ui/kit';

const APP = 'https://flathub.vercel.app/profile';

/** upi://pay with payee, amount and a note. The UPI ID goes in as typed: some apps choke on an encoded @. */
export const upiLink = (vpa: string, payee: string, paise: number, note: string): string =>
  `upi://pay?pa=${vpa.trim()}&pn=${encodeURIComponent(payee)}&am=${upiAmount(paise)}&cu=INR&tn=${encodeURIComponent(note)}`;

/** The share sheet with a ready message; WhatsApp in the browser where the phone has no share sheet. */
export async function askForUpi(first: string): Promise<void> {
  const message = `Hi ${first}, can you add your UPI ID in FlatHub (Profile → UPI ID)? Then I can pay you in one tap: ${APP}`;
  try {
    await Share.share({ message });
  } catch {
    await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }
}

/** "Pay Ansh ₹2,000 with UPI", or "Ask Ansh to add a UPI ID" when there is none. */
export function PayWithUpi({
  to,
  paise,
  note,
}: {
  to: { display_name: string; upi_vpa: string | null };
  paise: number;
  note: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const first = to.display_name.split(' ')[0];
  if (!to.upi_vpa)
    return <MagnetButton label={`Ask ${first} to add a UPI ID`} outline onPress={() => void askForUpi(first)} />;
  const link = upiLink(to.upi_vpa, to.display_name, paise, note);
  return (
    <>
      <MagnetButton
        label={`Pay ${first} with UPI`}
        icon={{ ios: 'arrow.up.right', android: 'north_east' }}
        outline
        onPress={() => Linking.openURL(link).catch(() => setError('No UPI app found on this phone.'))}
      />
      <ErrorText error={error} />
    </>
  );
}
