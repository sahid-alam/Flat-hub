import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/lib/util';
import { ErrorText, Field, Heading, MagnetButton, Rule, Screen, Slip, T, usePalette } from '@/ui/kit';

export default function Mates() {
  const c = usePalette();
  const { me, members, household, holder, isTreasurer, reload } = useHousehold();
  const [displayName, setDisplayName] = useState(me.display_name);
  const [vpa, setVpa] = useState(me.upi_vpa ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = Linking.createURL('/welcome', { queryParams: { code: household.invite_code } });
  const invite = `Join ${household.name} on FlatHub: ${link}\nInvite code: ${household.invite_code}`;

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
      <Slip magnet="green">
        <T size={20} weight="700">
          Invite a mate
        </T>
        <T soft>Send this on the flat's WhatsApp group. They sign in with their email, then tap the link or paste the code.</T>
        <T size={22} weight="700" style={{ letterSpacing: 2 }} color={c.green}>
          {household.invite_code}
        </T>
        <MagnetButton
          label="Share invite"
          color="green"
          icon={{ ios: 'square.and.arrow.up', android: 'share' }}
          onPress={() =>
            Platform.OS === 'web' ? navigator.clipboard?.writeText(invite) : Share.share({ message: invite })
          }
        />
      </Slip>

      <Heading>The flat</Heading>
      <Slip>
        {members.map((m, i) => (
          <View key={m.id}>
            {i > 0 && <Rule />}
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: 12, paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <T weight="600">
                  {m.display_name}
                  {m.id === me.id ? ' (me)' : ''}
                </T>
                <T size={15} soft>
                  {m.id === holder?.id ? 'Treasurer · ' : ''}
                  {m.upi_vpa ?? 'no UPI ID yet'}
                </T>
              </View>
              {isTreasurer && m.id !== me.id && (
                <MagnetButton label="Make treasurer" outline onPress={() => handOver(m.id, m.display_name)} />
              )}
            </View>
          </View>
        ))}
      </Slip>

      <Heading>Me</Heading>
      <Slip>
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
      </Slip>
      <MagnetButton label="Sign out" outline color="tomato" onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
