import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Share, View } from 'react-native';

import { useHousehold } from '@/lib/books';
import { supabase } from '@/lib/supabase';
import { confirm } from '@/lib/util';
import { Block, ErrorText, MagnetButton, Pill, Row, Rule, Screen, SectionLabel, T } from '@/ui/kit';

/** The flat's roster: who is here, who holds the kitty, and the invite. Your own name, UPI ID and
 *  password are on /profile — they were buried here, and that is the gap B5 closes. */
export default function Mates() {
  const { me, members, household, holder, isTreasurer, reload } = useHousehold();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const link = Linking.createURL('/welcome', { queryParams: { code: household.invite_code } });
  const invite = `Join ${household.name} on FlatHub: ${link}\nInvite code: ${household.invite_code}`;
  const mates = [...members].sort((a, b) => a.display_name.localeCompare(b.display_name));

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
        <ErrorText error={error} />
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

      {/* Your name, UPI ID, password and sign-out used to be the three blocks below this one, which
          is exactly why "I can't see anywhere where I can add my UPI". They are on /profile now. */}
      <Row
        label="Your name, UPI ID and password"
        icon={{ ios: 'person.crop.circle', android: 'account_circle' }}
        detail="on Profile"
        onPress={() => router.push('/profile')}
      />
    </Screen>
  );
}
