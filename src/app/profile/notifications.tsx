// Per-trigger notification settings: sound, silent in the bar, or off.
//
// Per-trigger mutes, not one master switch, and that is deliberate. The browser's permission prompt
// only appears on a direct tap, and a browser that has already been told "no" will never show it
// again — so a page cannot prompt its way back. Losing permission is unrecoverable; losing one
// trigger is not.
//
// This screen only stores the choice. B9 sends, and reads the table as the migration describes.
import { useState } from 'react';
import { View } from 'react-native';

import {
  GROUP_LABEL,
  MODE_LABEL,
  TRIGGERS,
  modeFor,
  modesFor,
  type Group,
  type Mode,
  type Trigger,
} from '@/domain/notifications';
import { useHousehold } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { Block, Choice, ErrorText, Pill, Rule, Screen, SectionLabel, T } from '@/ui/kit';

const GROUPS: Group[] = ['duties', 'money', 'kitchen', 'flat'];

export default function Notifications() {
  const { me, household, prefs, reload } = useHousehold();
  const [error, setError] = useState<string | null>(null);
  // the stored choice wins until the reload lands, so a tap doesn't visibly bounce back
  const [pending, setPending] = useState<Record<string, Mode>>({});
  const stored: Record<string, Mode> = {};
  for (const p of prefs) if (p.member_id === me.id) stored[p.trigger] = p.mode;

  async function choose(t: Trigger, mode: Mode) {
    setError(null);
    setPending((p) => ({ ...p, [t.key]: mode }));
    // Insert first, then update on the duplicate: only (mode, updated_at) are writable, and a
    // PostgREST upsert would need UPDATE on the whole table, `id` included.
    const row = { household_id: household.id, member_id: me.id, trigger: t.key };
    const updated_at = new Date().toISOString();
    let { error } = await supabase.from('notification_pref').insert({ id: newId(), ...row, mode, updated_at });
    if (error?.code === '23505') {
      ({ error } = await supabase.from('notification_pref').update({ mode, updated_at }).match(row));
    }
    if (error) {
      setPending((p) => {
        const { [t.key]: _gone, ...rest } = p;
        return rest;
      });
      return setError(error.message);
    }
    reload();
  }

  return (
    <Screen>
      <Block>
        <SectionLabel>What reaches your phone</SectionLabel>
        <T size={15} soft>
          <T size={15} weight="700">
            Sound
          </T>{' '}
          interrupts you.{' '}
          <T size={15} weight="700">
            Silent
          </T>{' '}
          waits in the app and in the 7:00 pm digest.{' '}
          <T size={15} weight="700">
            Off
          </T>{' '}
          means it never arrives.
        </T>
        {/* Honest about the platform, rather than letting an iPhone user think the switch is broken. */}
        <T size={13} soft>
          On an iPhone the sound and the vibration are your phone&apos;s own notification settings, not ours. So there,
          Sound and Silent decide <T size={13} weight="700">whether</T> something arrives, not how it feels. On Android
          we set it per notification.
        </T>
        <T size={13} soft>
          Four of these carry money or your own duty and cannot be switched off.
        </T>
      </Block>

      <ErrorText error={error} />

      {GROUPS.map((g) => (
        <View key={g} style={{ gap: 10 }}>
          <SectionLabel>{GROUP_LABEL[g]}</SectionLabel>
          <Block style={{ gap: 14 }}>
            {TRIGGERS.filter((t) => t.group === g).map((t, i) => (
              <View key={t.key} style={{ gap: 10 }}>
                {i > 0 && <Rule />}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T size={15.5} weight="600">
                      {t.label}
                    </T>
                    <T size={12} soft>
                      {t.detail}
                    </T>
                  </View>
                  {t.locked && <Pill label="Always on" />}
                </View>
                <Choice
                  label={t.label}
                  fill
                  value={modeFor(t, pending[t.key] ?? stored[t.key])}
                  onChange={(m) => choose(t, m)}
                  options={modesFor(t).map((m) => ({ value: m, label: MODE_LABEL[m] }))}
                />
              </View>
            ))}
          </Block>
        </View>
      ))}
    </Screen>
  );
}
