// Today's lunch and dinner. The only write Home does.
//
// Whoever holds a duty flagged `plans_meals` today is the one the cook waits on, so they get the
// fields; everyone else sees the same two lines read-only. The planner is derived from the FLAG,
// never from the duty being called "dishes" — the flat can rename or move it freely.
//
// meal_plan is not a ledger: "the last one to write wins", so this upserts in place rather than
// appending. See the migration's comment for why that does not break the append-only rule.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useHousehold, type MealRow } from '@/lib/books';
import { newId } from '@/lib/id';
import { supabase } from '@/lib/supabase';
import { sayError, today } from '@/lib/util';
import { Block, ErrorText, Field, MagnetButton, T } from '@/ui/kit';

type Meal = 'lunch' | 'dinner';

/**
 * Write today's line. NOT a PostgREST upsert: that sends the whole row on the conflict path, and
 * `date`, `meal` and `household_id` carry no UPDATE grant on purpose — a line is rewritten in
 * place, never dragged onto another day. (Measured: the upsert returns "permission denied for
 * table meal_plan".) So it updates the row the client already has, and inserts when there is none.
 *
 * The race — both planners writing the first line of the day at once — lands on the unique index
 * and comes back 23505; the loser then rewrites in place, which is what "the last one to write
 * wins" means anyway.
 */
async function write(
  householdId: string,
  date: string,
  meal: Meal,
  text: string,
  by: string,
  existingId: string | undefined,
): Promise<void> {
  const patch = { text, by, written_at: new Date().toISOString() };
  if (existingId) {
    const { error } = await supabase.from('meal_plan').update(patch).eq('id', existingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('meal_plan')
    .insert({ id: newId(), household_id: householdId, date, meal, ...patch });
  if (!error) return;
  if (error.code !== '23505') throw error;
  const { error: again } = await supabase
    .from('meal_plan')
    .update(patch)
    .eq('household_id', householdId)
    .eq('date', date)
    .eq('meal', meal);
  if (again) throw again;
}

const MEALS: Meal[] = ['lunch', 'dinner'];
const Title = { lunch: 'Lunch', dinner: 'Dinner' } as const;

export function MealsCard({ planners, youPlan }: { planners: string[]; youPlan: boolean }) {
  const { meals, household, me, reload } = useHousehold();
  const date = today();
  const mine = (meal: Meal): MealRow | undefined => meals.find((m) => m.date === date && m.meal === meal);

  if (!youPlan)
    return (
      <Block>
        {MEALS.map((meal) => (
          <Line key={meal} meal={meal} row={mine(meal)} />
        ))}
        <T size={12} soft>
          {planners.length === 0
            ? 'Nobody is on the meal duty today, so nobody has been asked.'
            : `Read-only for you. ${planners.length === 1 ? `Only ${planners[0]} writes` : `Only ${planners.join(' and ')} write`} it.`}
        </T>
      </Block>
    );

  return (
    <Block>
      <T size={15.5} weight="700">
        What&apos;s the plan today?
      </T>
      {MEALS.map((meal) => (
        <Writable
          key={meal}
          meal={meal}
          row={mine(meal)}
          onSave={async (text) => {
            await write(household.id, date, meal, text, me.id, mine(meal)?.id);
            await reload();
          }}
        />
      ))}
      <T size={12} soft>
        The cook reads this. Anything the kitchen is missing goes on the shopping list.
      </T>
      {/* ponytail: the concept's "what the kitchen hasn't got" tick-list is a screen of its own; this
          card is the home prompt the owner asked for, and that list belongs with Shopping (B3). */}
    </Block>
  );
}

/** A read-only line: the meal, and what was said, or that nothing was. */
function Line({ meal, row }: { meal: Meal; row: MealRow | undefined }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, minHeight: 32 }}>
      <T size={12} weight="700" soft style={{ width: 54 }}>
        {Title[meal]}
      </T>
      <T size={15.5} weight="600" soft={!row} style={{ flex: 1 }}>
        {row ? row.text : 'Not said yet'}
      </T>
    </View>
  );
}

/** The planner's line: tap it to write, save to commit. One field open at a time. */
function Writable({ meal, row, onSave }: { meal: Meal; row: MealRow | undefined; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(row?.text ?? '');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  if (!editing)
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={row ? `${Title[meal]}: ${row.text}. Tap to change it.` : `Write today's ${meal}`}
        onPress={() => {
          setText(row?.text ?? '');
          setEditing(true);
        }}
        style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center' }, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <T size={12} weight="700" soft style={{ width: 54 }}>
            {Title[meal]}
          </T>
          <T size={15.5} weight="600" soft={!row} style={{ flex: 1, textDecorationLine: row ? 'none' : 'underline' }}>
            {row ? row.text : 'Tap to write it'}
          </T>
        </View>
      </Pressable>
    );

  return (
    <View style={{ gap: 10 }}>
      <Field
        label={`${Title[meal]} today`}
        value={text}
        onChangeText={setText}
        placeholder="Dal chawal, bhindi"
        autoFocus
        maxLength={200}
      />
      <ErrorText error={error} />
      <MagnetButton
        label={busy ? 'Saving…' : trimmed ? `Save ${Title[meal].toLowerCase()}` : 'Write something first'}
        disabled={busy || !trimmed}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave(trimmed);
            setEditing(false);
          } catch (e) {
            setError(sayError(e));
          }
          setBusy(false);
        }}
      />
    </View>
  );
}
