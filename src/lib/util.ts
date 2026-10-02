import { Alert, Platform } from 'react-native';

import { istDate } from '@/domain/kitty';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const today = (): string => istDate(new Date().toISOString());
export const thisMonth = (): string => today().slice(0, 7);
export const monthOf = (iso: string): string => istDate(iso).slice(0, 7);
/** '2026-10' → 'Oct 2026' */
export const monthLabel = (month: string): string => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
/** '2026-10-02' → '2 Oct' */
export const dayLabel = (date: string): string => `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;
export const shiftMonth = (month: string, by: number): string => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
/** A date-only value stored as noon IST, so it never slips into the neighbouring day or month. */
export const dateToTimestamp = (date: string): string => `${date}T12:00:00+05:30`;

/** Confirm a destructive-ish action. RN-web's Alert has no buttons, so web uses window.confirm. */
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
