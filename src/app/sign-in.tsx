import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { DISPLAY, ErrorText, Field, Magnet, MagnetButton, Screen, Slip, T, usePalette } from '@/ui/kit';

export default function SignIn() {
  const c = usePalette();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const { error } = await fn();
    setBusy(false);
    if (error) setError(error.message);
    else after?.();
  }

  const send = () =>
    run(
      () =>
        supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: Linking.createURL('/') } }),
      () => setSent(true),
    );
  const verify = () => run(() => supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }));

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
          {!sent ? (
            <>
              <Field
                label="Your email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                onSubmitEditing={send}
              />
              <MagnetButton label={busy ? 'Sending…' : 'Email me a sign-in code'} onPress={send} disabled={busy || !email.includes('@')} />
            </>
          ) : (
            <>
              <T>
                We sent a 6-digit code and a sign-in link to <T weight="600">{email.trim()}</T>.
              </T>
              <Field
                label="Code"
                big
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                onSubmitEditing={verify}
              />
              <MagnetButton label={busy ? 'Checking…' : 'Sign in'} onPress={verify} disabled={busy || code.trim().length !== 6} />
              <MagnetButton label="Use a different email" outline onPress={() => setSent(false)} />
            </>
          )}
          <ErrorText error={error} />
        </Slip>
      </View>
    </Screen>
  );
}
