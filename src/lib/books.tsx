import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Absence, Books, PoolEntry, Spend } from '@/domain/kitty';
import { supabase } from '@/lib/supabase';

export type Household = {
  id: string;
  name: string;
  pool_holder_id: string | null;
  monthly_topup_paise: number;
  invite_code: string;
};
export type MemberRow = {
  id: string;
  user_id: string;
  display_name: string;
  upi_vpa: string | null;
  joined_on: string;
  left_on: string | null;
};
export type AbsenceRow = Absence & { id: string; created_at: string };
export type SpendRow = Spend & { source: 'zepto' | 'local' | 'other'; store_name: string | null; created_at: string };
export type LineRow = { id: string; spend_id: string; name: string; line_total_paise: number; kind: 'item' | 'fee' | 'discount' };
export type EntryRow = PoolEntry & { id: string; occurred_at: string; note: string | null; spend_id: string | null };

type Data = {
  household: Household;
  me: MemberRow;
  members: MemberRow[];
  absences: AbsenceRow[];
  spends: SpendRow[];
  lines: LineRow[];
  entries: EntryRow[];
};

type Ctx = {
  session: Session | null | undefined; // undefined while restoring
  data: Data | null | undefined; // null: signed in but no household yet
  books: Books | null;
  reload: () => Promise<void>;
};

const BooksContext = createContext<Ctx | null>(null);

async function load(userId: string): Promise<Data | null> {
  const { data: me, error } = await supabase.from('member').select('*').eq('user_id', userId).limit(1).maybeSingle();
  if (error) throw error;
  if (!me) return null;
  const h = me.household_id as string;
  const [household, members, absences, spends, lines, entries] = await Promise.all([
    supabase.from('household').select('*').eq('id', h).single(),
    supabase.from('member').select('*').eq('household_id', h).order('display_name'),
    supabase.from('member_absence').select('*').eq('household_id', h).order('from_date', { ascending: false }),
    supabase.from('spend').select('*').eq('household_id', h).order('occurred_at', { ascending: false }),
    supabase.from('spend_line').select('*').eq('household_id', h).order('created_at'),
    supabase.from('pool_entry').select('*').eq('household_id', h).order('occurred_at', { ascending: false }),
  ]);
  // ponytail: loads the whole household every time; page by month once a flat has years of rows
  for (const r of [household, members, absences, spends, lines, entries]) if (r.error) throw r.error;
  return {
    household: household.data,
    me,
    members: members.data!,
    absences: absences.data!,
    spends: spends.data!,
    lines: lines.data!,
    entries: entries.data!,
  };
}

export function BooksProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [data, setData] = useState<Data | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const reload = useCallback(async () => {
    if (userId) setData(await load(userId));
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    load(userId).then((d) => live && setData(d));
    return () => {
      live = false;
      setData(undefined); // signed out or switched user: forget the old flat
    };
  }, [userId]);

  const books = useMemo<Books | null>(
    () =>
      data
        ? {
            members: data.members,
            absences: data.absences,
            spends: data.spends,
            entries: data.entries,
            monthlyTopupPaise: data.household.monthly_topup_paise,
          }
        : null,
    [data],
  );

  return <BooksContext.Provider value={{ session, data, books, reload }}>{children}</BooksContext.Provider>;
}

export function useBooks() {
  const ctx = useContext(BooksContext);
  if (!ctx) throw new Error('useBooks outside BooksProvider');
  return ctx;
}

/** For screens behind the household guard. */
export function useHousehold() {
  const { data, books, reload } = useBooks();
  if (!data || !books) throw new Error('no household');
  const name = (id: string) => data.members.find((m) => m.id === id)?.display_name ?? '?';
  const holder = data.members.find((m) => m.id === data.household.pool_holder_id) ?? null;
  return { ...data, books, reload, name, holder, isTreasurer: holder?.id === data.me.id };
}
