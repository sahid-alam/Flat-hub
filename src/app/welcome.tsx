import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useBooks } from '@/lib/books';
import { newId } from '@/lib/id';
import { clearInvite, codeOf, savedInvite } from '@/lib/invite';
import { supabase } from '@/lib/supabase';
import { Block, Choice, ErrorText, Field, Logo, MagnetButton, Screen, T } from '@/ui/kit';

/** Signed in, not in a flat yet: start one, or join with an invite code. */
export default function Welcome() {
  const { reload } = useBooks();
  const params = useLocalSearchParams<{ code?: string }>();
  const opened = Linking.useLinkingURL();
  const invite = params.code ?? codeOf(opened);
  const [mode, setMode] = useState<'join' | 'create'>(invite ? 'join' : 'create');
  const [name, setName] = useState('');
  const [flat, setFlat] = useState('');
  const [code, setCode] = useState(invite ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // an invite opened before signing in was saved at startup
  useEffect(() => {
    if (invite) return;
    savedInvite().then((saved) => {
      if (!saved) return;
      setCode(saved);
      setMode('join');
    });
  }, [invite]);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } =
      mode === 'create'
        ? await supabase.rpc('create_household', {
            p_household_id: newId(),
            p_member_id: newId(),
            p_name: flat.trim(),
            p_display_name: name.trim(),
          })
        : await supabase.rpc('join_household', {
            p_member_id: newId(),
            p_invite_code: code.trim(),
            p_display_name: name.trim(),
          });
    setBusy(false);
    if (error) setError(error.code === 'P0002' ? "That invite code doesn't match a flat." : error.message);
    else {
      await clearInvite();
      await reload();
    }
  }

  const ok = name.trim() && (mode === 'create' ? flat.trim() : code.trim());
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
        <Logo size={48} />
        <T size={28} weight="700">
          Your flat
        </T>
        <Choice
          value={mode}
          onChange={setMode}
          options={[
            { value: 'create', label: 'Start a flat' },
            { value: 'join', label: 'I have an invite' },
          ]}
        />
        <Block>
          <Field label="Your name, as the flat knows you" value={name} onChangeText={setName} placeholder="Sahid" />
          {mode === 'create' ? (
            <Field label="Flat name" value={flat} onChangeText={setFlat} placeholder="Flat 4B" />
          ) : (
            <Field label="Invite code" value={code} onChangeText={setCode} autoCapitalize="none" placeholder="from the WhatsApp link" />
          )}
          <MagnetButton
            label={busy ? 'One moment…' : mode === 'create' ? 'Start the flat' : 'Join the flat'}
            onPress={submit}
            disabled={busy || !ok}
          />
          {mode === 'create' && <T size={15} soft>You'll hold the kitty until you hand it to the treasurer.</T>}
          <ErrorText error={error} />
        </Block>
        <MagnetButton label="Not you? Sign out" outline onPress={() => supabase.auth.signOut()} />
      </View>
    </Screen>
  );
}
