import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/lib/util';
import { Block, ErrorText, Field, MagnetButton, Pill, Rule, Screen, SectionLabel, T } from '@/ui/kit';

export default function Mates() {
  const { me, members, household, holder, isTreasurer, reload } = useHousehold();
  const [displayName, setDisplayName] = useState(me.display_name);
  const [vpa, setVpa] = useState(me.upi_vpa ?? '');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = Linking.createURL('/welcome', { queryParams: { code: household.invite_code } });
  const invite = `Join ${household.name} on FlatHub: ${link}\nInvite code: ${household.invite_code}`;
  const mates = [...members].sort((a, b) => a.display_name.localeCompare(b.display_name));

  async function saveMe() {
    setError(null);
    const { error } = await supabase
      .from('member')
      .update({ display_name: displayName.trim(), upi_vpa: vpa.trim() || null })
      .eq('id', me.id);
    if (error) return setError(error.code === '23514' ? 'That UPI ID looks wrong (name@bank).' : error.message);
    setSaved(true);
    reload();
  }

  async function handOver(memberId: string, memberName: string) {
    if (!(await confirm(`Make ${memberName} the treasurer?`, 'Top-ups will go to them, and only they can mark reimbursements.', 'Hand over'))) return;
    const { error } = await supabase.rpc('set_pool_holder', { p_household_id: household.id, p_member_id: memberId });
    if (error) setError(error.message);
    reload();
  }

  return (
    <Screen>
      <Block>
        <SectionLabel>Invite a mate</SectionLabel>
        <T soft>Send this on the flat's WhatsApp group. Once they have a name and password, they open the link or paste the code.</T>
        <T size={28} weight="700" style={{ letterSpacing: 3 }}>
          {household.invite_code}
        </T>
        <MagnetButton
          label={copied ? 'Invite copied' : 'Share invite'}
          color="brass"
          icon={{ ios: 'square.and.arrow.up', android: 'share' }}
          onPress={async () => {
            // phones' browsers have the Web Share sheet; desktop browsers fall back to the clipboard
            const nav: Partial<Navigator> = Platform.OS === 'web' ? navigator : {};
            if (Platform.OS !== 'web' || nav.share) return Share.share({ message: invite }).catch(() => {});
            await nav.clipboard?.writeText(invite);
            setCopied(true);
          }}
        />
      </Block>

      <Block>
        <SectionLabel>The flat</SectionLabel>
        {isTreasurer && (
          <T size={15} soft>
            You hold the kitty. To hand it over, pick the new treasurer.
          </T>
        )}
        <View>
          {mates.map((m, i) => (
            <View key={m.id} style={{ gap: 10, paddingBottom: 8 }}>
              {i > 0 && <Rule />}
              <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T weight="600">
                    {m.display_name}
                    {m.id === me.id ? ' (me)' : ''}
                  </T>
                  <T size={13} soft>
                    {m.upi_vpa ?? 'no UPI ID yet'}
                  </T>
                </View>
                {m.id === holder?.id && <Pill label="Treasurer" />}
              </View>
              {isTreasurer && m.id !== me.id && (
                <MagnetButton
                  label={`Make ${m.display_name} treasurer`}
                  outline
                  onPress={() => handOver(m.id, m.display_name)}
                />
              )}
            </View>
          ))}
        </View>
      </Block>

      <Block>
        <SectionLabel>Me</SectionLabel>
        <Field label="Name" value={displayName} onChangeText={(t) => (setDisplayName(t), setSaved(false))} />
        <Field
          label={isTreasurer ? 'Your UPI ID (top-ups are paid here)' : 'Your UPI ID'}
          value={vpa}
          onChangeText={(t) => (setVpa(t), setSaved(false))}
          autoCapitalize="none"
          placeholder="name@okhdfcbank"
        />
        <ErrorText error={error} />
        <MagnetButton label={saved ? 'Saved' : 'Save'} onPress={saveMe} disabled={saved || !displayName.trim()} />
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
      <MagnetButton label="Sign out" outline onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
