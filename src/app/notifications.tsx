// Notifications: the one explicit control that turns push on. Behind the Kitty header's people
// button, next to the other occasional things.
//
// The whole screen exists because the permission prompt may only come from a real tap
// (https://webkit.org/blog/13878/), and because a browser already told no never shows the prompt
// again — so this is the one place that asks, it asks once, and it says plainly what it will send
// before it asks. A mate who knows it is one message on the morning they are on duty says yes;
// a mate ambushed by a prompt says no, and that no is close to permanent.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { myDevices, pushState, subscribe, unsubscribe, type PushState } from '@/lib/push';
import { dayLabel } from '@/lib/util';
import { Block, ErrorText, MagnetButton, Row, Rule, Screen, SectionLabel, T } from '@/ui/kit';

type Device = { id: string; user_agent: string | null; last_seen_at: string };

/** "Chrome on Android", near enough, from the one string the browser gives us. */
const deviceName = (ua: string | null): string => {
  if (!ua) return 'A device';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'A browser';
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : 'this device';
  return `${browser} on ${os}`;
};

export default function Notifications() {
  const { household, me } = useHousehold();
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    pushState().then(setState);
    myDevices(me.id).then(setDevices);
  }, [me.id]);

  // The tap. Everything that asks for permission has to be reachable from here and nowhere else.
  const onTurnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await subscribe(household.id, me.id));
      setDevices(await myDevices(me.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications on.');
    } finally {
      setBusy(false);
    }
  };

  const onTurnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await unsubscribe());
      setDevices(await myDevices(me.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn notifications off.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Block>
        <SectionLabel>What you'll get</SectionLabel>
        <T size={15}>
          One message on the morning a duty is yours. Nothing on the days it isn't.
        </T>
        <T size={13} soft>
          Everything else — a lot expiring, something added to the shopping list, a month closed —
          stays on the screen it belongs to and never buzzes your phone.
        </T>
      </Block>

      {state === null ? (
        <Block>
          <T soft>Checking…</T>
        </Block>
      ) : state.kind === 'on' ? (
        <Block>
          <SectionLabel>On</SectionLabel>
          <T size={15}>This device will be reminded when a duty is yours.</T>
          <View style={{ height: 8 }} />
          <MagnetButton label="Turn off on this device" onPress={onTurnOff} disabled={busy} outline />
        </Block>
      ) : state.kind === 'can-ask' || state.kind === 'off' ? (
        <Block>
          <SectionLabel>{state.kind === 'off' ? 'Off on this device' : 'Not on yet'}</SectionLabel>
          {state.kind === 'off' && (
            <T size={13} soft>
              Your phone still allows them — this device just has no subscription. iPhones drop it
              every so often on their own, which is why this is one tap and not a reinstall.
            </T>
          )}
          <View style={{ height: 8 }} />
          <MagnetButton
            label="Turn on notifications"
            onPress={onTurnOn}
            disabled={busy}
            color="brass"
            icon={{ ios: 'bell', android: 'notifications' }}
          />
          <T size={13} soft>
            Your phone will ask you to allow them. It only asks once.
          </T>
        </Block>
      ) : state.kind === 'needs-install' ? (
        <Block>
          <SectionLabel>Add FlatHub to your Home Screen first</SectionLabel>
          <T size={15}>
            On an iPhone, notifications only work from the Home Screen app — not from a Safari tab.
          </T>
          <T size={13} soft>
            Tap Share, then "Add to Home Screen". Open FlatHub from the new icon and come back here.
          </T>
        </Block>
      ) : state.kind === 'denied' ? (
        <Block>
          <SectionLabel>Blocked on this device</SectionLabel>
          {/* No button here on purpose: the prompt will not appear again, so offering a tap that
              cannot work would just teach the mate the app is broken. */}
          <T size={15}>Notifications are turned off for FlatHub in this device's settings.</T>
          <T size={13} soft>
            It can only be changed there — the app isn't allowed to ask a second time. On an iPhone
            that's Settings → Notifications → FlatHub; on Android, the app or site settings.
          </T>
        </Block>
      ) : (
        <Block>
          <SectionLabel>Not available here</SectionLabel>
          <T size={15}>This browser can't do notifications. Open FlatHub on your phone.</T>
        </Block>
      )}

      <ErrorText error={error} />

      {devices.length > 0 && (
        <Block style={{ gap: 0, paddingVertical: 4 }}>
          <SectionLabel>Your devices</SectionLabel>
          {devices.map((d, i) => (
            <View key={d.id}>
              {i > 0 && <Rule />}
              <Row label={deviceName(d.user_agent)} detail={`seen ${dayLabel(d.last_seen_at.slice(0, 10))}`} />
            </View>
          ))}
        </Block>
      )}

      <T size={13} soft>
        A notification is only ever a nudge. Whatever it says is already on the screen it points at,
        so missing one costs nothing.
      </T>
    </Screen>
  );
}
