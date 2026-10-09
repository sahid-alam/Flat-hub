// Your own things, and the screen that answers "I can't see anywhere where I can add my UPI".
// Hypelist's cover + overlapping avatar, X's camera badge on both images, CRED's UPI row with the
// one line that earns it. Everything flat-level — mates, statements, reimbursements, the top-up —
// stays on /flat, and the last block says so rather than leaving you to guess.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { donePoints } from '@/domain/duties';
import { useHousehold } from '@/lib/books';
import { PhotoError, pickPhoto, supabaseStore, type PhotoKind } from '@/lib/photos';
import { supabase } from '@/lib/supabase';
import { monthLabel } from '@/lib/util';
import {
  Block,
  ErrorText,
  Field,
  Heading,
  Icon,
  MagnetButton,
  Pill,
  Row,
  Rule,
  Screen,
  SectionLabel,
  T,
  usePalette,
} from '@/ui/kit';

export default function Profile() {
  const c = usePalette();
  const { me, household, holder, isTreasurer, choreEvents, reload } = useHousehold();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(me.display_name);
  const [vpa, setVpa] = useState(me.upi_vpa ?? '');
  const [saved, setSaved] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const points = donePoints(choreEvents, me.id);
  const payer = holder && holder.id !== me.id ? holder.display_name.split(' ')[0] : null;

  async function saveMe() {
    setError(null);
    const { error } = await supabase
      .from('member')
      .update({ display_name: displayName.trim(), upi_vpa: vpa.trim() || null })
      .eq('id', me.id);
    if (error) return setError(error.code === '23514' ? 'That UPI ID looks wrong (name@bank).' : error.message);
    setSaved(true);
    setEditing(false);
    reload();
  }

  async function swapPhoto(kind: PhotoKind) {
    setError(null);
    try {
      const blob = await pickPhoto(kind);
      if (!blob) return;
      const key = await supabaseStore.put(household.id, me.id, kind, blob);
      const { error } = await supabase
        .from('member')
        .update(kind === 'avatar' ? { avatar_path: key } : { cover_path: key })
        .eq('id', me.id);
      if (error) throw error;
      reload();
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : ((e as Error).message ?? 'That photo did not save.'));
    }
  }

  return (
    <Screen>
      <Cover path={me.cover_path} onPress={() => swapPhoto('cover')} />

      <View style={{ marginTop: -46, gap: 4 }}>
        <Avatar path={me.avatar_path} name={me.display_name} onPress={() => swapPhoto('avatar')} />
        <View style={{ marginTop: 8 }}>
          <Heading>{me.display_name}</Heading>
        </View>
        {isTreasurer && <Pill label="Treasurer — the kitty is paid to you" style={{ alignSelf: 'flex-start' }} />}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 }}>
          <Stat value={monthLabel(me.joined_on.slice(0, 7))} label="joined" />
          <View style={{ width: 1, height: 28, backgroundColor: c.hair }} />
          <Stat value={String(points)} label="duty points" />
        </View>
        {!editing && (
          <MagnetButton
            label="Edit profile"
            outline
            onPress={() => (setEditing(true), setSaved(false))}
          />
        )}
      </View>

      {editing ? (
        <Block>
          <SectionLabel>Your name and UPI ID</SectionLabel>
          <Field label="Name" value={displayName} onChangeText={(t) => (setDisplayName(t), setSaved(false))} />
          <Field
            label="UPI ID"
            value={vpa}
            onChangeText={(t) => (setVpa(t), setSaved(false))}
            autoCapitalize="none"
            placeholder="name@okhdfcbank"
          />
          <ErrorText error={error} />
          <MagnetButton label="Save" color="brass" onPress={saveMe} disabled={!displayName.trim()} />
          <MagnetButton label="Cancel" outline onPress={() => setEditing(false)} />
        </Block>
      ) : (
        <>
          <SectionLabel>How you get paid back</SectionLabel>
          <Block style={{ gap: 0, paddingVertical: 4 }}>
            <Row
              label="UPI ID"
              detail={
                <T size={15.5} num soft={!me.upi_vpa}>
                  {me.upi_vpa ?? 'not set'}
                </T>
              }
              onPress={() => setEditing(true)}
            />
          </Block>
          <T size={13} soft>
            {payer ? `${payer} pays you back here.` : 'Your flatmates pay you back here.'} It is the only reason this
            field exists.
          </T>
          {saved && (
            <T size={14} color={c.positive} weight="600">
              Saved
            </T>
          )}
          <ErrorText error={error} />
        </>
      )}

      <SectionLabel>Yours</SectionLabel>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        <Row
          label="Notifications"
          icon={{ ios: 'bell', android: 'notifications' }}
          detail="per reminder"
          onPress={() => router.push('/profile/notifications')}
        />
        <Rule />
        <Row
          label="Away dates"
          icon={{ ios: 'airplane', android: 'flight' }}
          detail="tell the flat"
          onPress={() => router.push('/away')}
        />
      </Block>

      <Block>
        <SectionLabel>Password</SectionLabel>
        <Field
          label="New password (at least 8 characters)"
          value={password}
          onChangeText={(t) => (setPassword(t), setPasswordSaved(false))}
          secureTextEntry
          autoComplete="new-password"
        />
        <MagnetButton
          label={passwordSaved ? 'Password changed' : 'Change password'}
          disabled={passwordSaved || password.length < 8}
          onPress={async () => {
            setError(null);
            const { error } = await supabase.auth.updateUser({ password });
            if (error) return setError(error.message);
            setPassword('');
            setPasswordSaved(true);
          }}
        />
      </Block>

      {/* The owner's complaint about the old /flat sheet was that his UPI ID was mixed in with the
          flat's business. Naming the two piles is cheaper than hiding one of them. */}
      <SectionLabel>Stays with the flat, not with you</SectionLabel>
      <Block style={{ gap: 0, paddingVertical: 4 }}>
        <Row
          label="The flat"
          icon={{ ios: 'house', android: 'home' }}
          detail="mates, statements, reimbursements"
          onPress={() => router.push('/flat')}
        />
      </Block>

      <MagnetButton label="Sign out" outline onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ gap: 1 }}>
      <T size={15.5} num>
        {value}
      </T>
      <SectionLabel>{label}</SectionLabel>
    </View>
  );
}

/** Both images are private objects in Storage, so each one needs a signed URL before it can render. */
function useSignedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    supabaseStore.url(path).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path]);
  // Derived rather than cleared in the effect: no photo means no URL, whatever was signed before.
  return path ? url : null;
}

function Cover({ path, onPress }: { path: string | null; onPress: () => void }) {
  const c = usePalette();
  const url = useSignedUrl(path);
  return (
    <View style={{ height: 132, borderRadius: 22, backgroundColor: c.raised, overflow: 'hidden' }}>
      {url && <Image source={{ uri: url }} style={{ flex: 1 }} contentFit="cover" transition={150} />}
      <CameraBadge
        size={36}
        icon={18}
        label={path ? 'Change the cover picture' : 'Add a cover picture'}
        onPress={onPress}
        style={{ position: 'absolute', right: 10, top: 10 }}
      />
    </View>
  );
}

function Avatar({ path, name, onPress }: { path: string | null; name: string; onPress: () => void }) {
  const c = usePalette();
  const url = useSignedUrl(path);
  return (
    <View style={{ width: 84, height: 84, marginLeft: 4 }}>
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          backgroundColor: c.raised,
          borderWidth: 4,
          borderColor: c.ground,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
        {url ? (
          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
        ) : (
          <T size={30} num>
            {name.slice(0, 2)}
          </T>
        )}
      </View>
      <CameraBadge
        size={30}
        icon={15}
        label={path ? 'Change your profile picture' : 'Add a profile picture'}
        onPress={onPress}
        style={{ position: 'absolute', right: -3, bottom: -3 }}
      />
    </View>
  );
}

/** X puts the same badge on the cover and the avatar, so "change the background picture" needs no
 *  explaining. The solid pill fill is the only one that reads on top of an arbitrary photo. */
function CameraBadge({
  size,
  icon,
  label,
  onPress,
  style,
}: {
  size: number;
  icon: number;
  label: string;
  onPress: () => void;
  style?: object;
}) {
  const c = usePalette();
  const hit = Math.max(0, Math.round((48 - size) / 2));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hit}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: c.solid,
          borderWidth: 3,
          borderColor: c.ground,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}>
      <Icon name={{ ios: 'camera', android: 'photo_camera' }} size={icon} color={c.onSolid} />
    </Pressable>
  );
}
