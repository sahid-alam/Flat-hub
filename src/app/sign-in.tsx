import { useState } from 'react';
import { View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { DISPLAY, ErrorText, Field, Magnet, MagnetButton, Screen, Slip, T, usePalette } from '@/ui/kit';

// Accounts are made for each mate (no sign-up, no email is ever sent), so a bare name is enough.
// ponytail: name → name@flathub.test; give mates real emails if password resets by email are ever needed
const toEmail = (login: string) => {
  const l = login.trim().toLowerCase();
  return l.includes('@') ? l : `${l}@flathub.test`;
};

export default function SignIn() {
  const c = usePalette();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: toEmail(login), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? "That name and password don't match." : error.message);
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 28 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Magnet color={c.green} />
            <Magnet color={c.tomato} />
            <Magnet color={c.blue} />
          </View>
          <T size={44} style={{ fontFamily: DISPLAY, lineHeight: 52 }}>
            FlatHub
          </T>
          <T soft>The flat's kitty, on the fridge door.</T>
        </View>
        <Slip>
          <Field
            label="Your name"
            value={login}
            onChangeText={setLogin}
            autoCapitalize="none"
            autoComplete="username"
            placeholder="sahid"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            onSubmitEditing={signIn}
          />
          <MagnetButton label={busy ? 'Signing in…' : 'Sign in'} onPress={signIn} disabled={busy || !login.trim() || !password} />
          <ErrorText error={error} />
        </Slip>
        <T size={15} soft center>
          Forgot your password? Ask Sahid to reset it.
        </T>
      </View>
    </Screen>
  );
}
