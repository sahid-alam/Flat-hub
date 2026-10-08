// Web push subscription: register the service worker, ask once from a real tap, and keep the
// endpoint in push_subscription. Spec: docs/NOTIFICATIONS.md.
//
// Two platform facts shape everything here, and neither is negotiable:
//
// 1. THE PROMPT MUST COME FROM A TAP. WebKit's requirement is verbatim "as long as that request is
//    in response to direct user interaction — such as tapping on a 'subscribe' button provided by
//    the web app" (https://webkit.org/blog/13878/). So nothing in this file prompts on load, and
//    `subscribe()` is only ever called from an onPress. It matters more than it looks: a browser
//    that has already been told no does NOT show the prompt again, so the page cannot prompt its
//    way back, and recovery runs through OS settings we may not be able to talk a mate through.
//    One denial is a mate we have stopped reaching.
//
// 2. iOS SILENTLY LOSES THE SUBSCRIPTION. Reported repeatedly on Apple's own forums
//    (https://developer.apple.com/forums/thread/728796) with no event fired. `refresh()` below is
//    the mitigation and runs on every app open: re-read the subscription, re-subscribe if it went
//    missing, and touch last_seen_at either way.
//
// Everything is web-only on purpose. expo-notifications does not support the web platform at all,
// and the shipped app IS the web build; an APK would be a second, separate stack (FCM tokens, a
// different send call) that does nothing for the iPhone. Don't add it here.

import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;

/** What the Settings button is allowed to offer, which is not the same question as "did it work". */
export type PushState =
  /** Not a browser, or a browser with no Push API: the native builds and old desktop Safari. */
  | { kind: 'unsupported' }
  /** iOS in a Safari TAB. Push works only from a Home Screen install — a tab can never subscribe. */
  | { kind: 'needs-install' }
  /** Asked before and refused. There is no button to show: the prompt will not appear again. */
  | { kind: 'denied' }
  /** Never asked. This is the only state where a tap may prompt. */
  | { kind: 'can-ask' }
  /** Granted, and this device has a live subscription. */
  | { kind: 'on' }
  /** Granted, but no subscription — iOS dropped it, or the mate turned it off here. A tap fixes it. */
  | { kind: 'off' };

const isWeb = (): boolean => typeof window !== 'undefined' && typeof navigator !== 'undefined';

/** iOS/iPadOS, including the iPad that reports itself as a Mac with a touchscreen. */
const isApple = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);

/** Running as an installed Home Screen web app rather than in a browser tab. */
const isInstalled = (): boolean =>
  ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true) ||
  window.matchMedia?.('(display-mode: standalone)').matches === true;

/**
 * Where the mate stands, right now. Read it on render; it never prompts and never subscribes.
 * The order of the checks is the point: `needs-install` has to beat `unsupported`, because on an
 * iPhone they look identical (no window.PushManager) and the advice is completely different —
 * "your browser can't" is wrong and dead-ends, "add it to your Home Screen first" is the fix.
 */
export async function pushState(): Promise<PushState> {
  if (!isWeb() || !('serviceWorker' in navigator)) return { kind: 'unsupported' };
  if (!('PushManager' in window)) return isApple() && !isInstalled() ? { kind: 'needs-install' } : { kind: 'unsupported' };
  if (!VAPID_PUBLIC_KEY) return { kind: 'unsupported' }; // no key in the bundle: nothing can be signed
  if (Notification.permission === 'denied') return { kind: 'denied' };
  if (Notification.permission === 'default') return { kind: 'can-ask' };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? { kind: 'on' } : { kind: 'off' };
}

/** base64url → the Uint8Array that applicationServerKey insists on. A plain string is rejected. */
function urlBase64ToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A PushSubscription key back to the base64url the server needs for RFC 8291. */
function bytesToUrlBase64(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const register = (): Promise<ServiceWorkerRegistration> =>
  navigator.serviceWorker.register('/sw.js', { scope: '/' });

/**
 * Store this device's endpoint. Keyed on the endpoint, not on the member: a mate has a phone AND a
 * laptop, and both should be reachable. An endpoint the browser reissues leaves the old row behind
 * — that row is reaped by the notify function when the push service answers 404/410, which is the
 * only reliable signal that an endpoint is dead.
 */
async function save(sub: PushSubscription, householdId: string, memberId: string): Promise<void> {
  const row = {
    endpoint: sub.endpoint,
    p256dh: bytesToUrlBase64(sub.getKey('p256dh')),
    auth: bytesToUrlBase64(sub.getKey('auth')),
    user_agent: navigator.userAgent.slice(0, 300),
  };
  // Not an upsert: `id`, `household_id` and `member_id` have no UPDATE grant (a mate may change
  // their keys, never whose row it is), and an upsert would try to write all of them.
  const { data: existing } = await supabase.from('push_subscription').select('id').eq('endpoint', sub.endpoint).maybeSingle();
  if (existing) {
    await supabase
      .from('push_subscription')
      .update({ ...row, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase.from('push_subscription').insert({ id: newId(), household_id: householdId, member_id: memberId, ...row });
  }
}

/**
 * Turn notifications on. CALL THIS ONLY FROM AN onPress — see fact 1 at the top of the file.
 * Returns the state afterwards, so a refusal is a state and not an exception.
 */
export async function subscribe(householdId: string, memberId: string): Promise<PushState> {
  const state = await pushState();
  if (state.kind !== 'can-ask' && state.kind !== 'off') return state;

  const reg = await register();
  await navigator.serviceWorker.ready;
  // Inside the tap's user gesture. A refusal here is permanent, so there is nothing to retry.
  if (Notification.permission === 'default' && (await Notification.requestPermission()) !== 'granted') {
    return { kind: 'denied' };
  }
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      // Mandatory, everywhere: we promise to show a notification for every push we send.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY!),
    }));
  await save(sub, householdId, memberId);
  return { kind: 'on' };
}

/** Turn it off for this device: drop the browser's subscription and its row. */
export async function unsubscribe(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await supabase.from('push_subscription').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  // Still 'off', not 'can-ask': the OS permission stays granted, so turning it back on is one tap.
  return { kind: 'off' };
}

/**
 * Called on every app open. The iOS mitigation: re-read the subscription, silently re-subscribe if
 * it vanished, and touch last_seen_at so a phone that has quietly stopped being reachable shows up
 * as stale rather than as fine.
 *
 * Never prompts — it returns immediately unless permission is ALREADY granted. Calling subscribe()
 * without a gesture would at best do nothing and at worst spend the one prompt we get.
 * Every failure is swallowed: this runs beside the kitty's reload, and notifications breaking must
 * never be something the mate notices on the Kitty tab.
 */
export async function refresh(householdId: string, memberId: string): Promise<void> {
  try {
    if (!isWeb() || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (!VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return;
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await register());
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY),
      }));
    await save(sub, householdId, memberId);
  } catch {
    // A missing push_subscription table, a dropped network, a browser that changed its mind: all
    // of them degrade notifications and nothing else.
  }
}

/** This mate's registered devices, for the Settings screen. `?? []` — a missing table is "none". */
export async function myDevices(memberId: string): Promise<{ id: string; user_agent: string | null; last_seen_at: string }[]> {
  const { data } = await supabase
    .from('push_subscription')
    .select('id, user_agent, last_seen_at')
    .eq('member_id', memberId)
    .order('last_seen_at', { ascending: false });
  return data ?? [];
}
