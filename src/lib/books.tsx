import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { ChoreEvent, Duty } from '@/domain/duties';
import type { Absence, Books, Close, PoolEntry, Spend } from '@/domain/kitty';
import type { Mode } from '@/domain/notifications';
import type { Lot, ManualItem, Move, Uom } from '@/domain/stock';
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
  avatar_path: string | null;
  cover_path: string | null;
};
export type AbsenceRow = Absence & { id: string; created_at: string };
export type SpendRow = Spend & { source: 'zepto' | 'local' | 'other'; store_name: string | null; created_at: string };
export type LineRow = {
  id: string;
  spend_id: string;
  name: string;
  line_total_paise: number;
  kind: 'item' | 'fee' | 'discount';
  product_id: string | null;
  qty: number;
  unit: string | null;
};
export type EntryRow = PoolEntry & { id: string; occurred_at: string; note: string | null; spend_id: string | null };
export type CloseRow = Close & { id: string; closed_at: string; closed_by: string };
export type ProductRow = {
  id: string;
  name: string;
  aliases: string[];
  favourite: boolean;
  default_price_paise: number | null;
  track_stock: boolean;
  category: string | null;
  base_unit: 'g' | 'ml' | 'pc';
  min_qty: number | null;
};

// The domain types carry the fields the stock maths reads; the rows add what only the DB and the UI need.
export type LotRow = Lot & { household_id: string; spend_line_id: string | null; created_at: string };
export type MoveRow = Move & {
  id: string;
  household_id: string;
  reason: 'purchase' | 'consume' | 'discard' | 'adjust';
  member_id: string;
  occurred_at: string;
};
export type UomRow = Uom & { household_id: string };
export type ShoppingRow = ManualItem & {
  id: string;
  household_id: string;
  added_by: string;
  done_by_spend_line_id: string | null;
  created_at: string;
};

/** Only the triggers a mate has changed; an absent row is `defaultMode` (src/domain/notifications.ts). */
export type PrefRow = { id: string; member_id: string; trigger: string; mode: Mode };

export type DutyRow = Duty & { household_id: string; created_at: string };
export type ChoreEventRow = ChoreEvent & { household_id: string; occurred_at: string; created_at: string };

type Data = {
  household: Household;
  me: MemberRow;
  members: MemberRow[];
  absences: AbsenceRow[];
  spends: SpendRow[];
  lines: LineRow[];
  entries: EntryRow[];
  products: ProductRow[];
  lots: LotRow[];
  moves: MoveRow[];
  uoms: UomRow[];
  shopping: ShoppingRow[];
  closes: CloseRow[] | null; // null: the month_close table isn't there yet
  duties: DutyRow[];
  choreEvents: ChoreEventRow[];
  prefs: PrefRow[];
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
  const [household, members, absences, spends, lines, entries, products, lots, moves, uoms, shopping, closes, duties, choreEvents, prefs] =
    await Promise.all([
      supabase.from('household').select('*').eq('id', h).single(),
      supabase.from('member').select('*').eq('household_id', h).order('display_name'),
      supabase.from('member_absence').select('*').eq('household_id', h).order('from_date', { ascending: false }),
      supabase.from('spend').select('*').eq('household_id', h).order('occurred_at', { ascending: false }),
      supabase.from('spend_line').select('*').eq('household_id', h).order('created_at'),
      supabase.from('pool_entry').select('*').eq('household_id', h).order('occurred_at', { ascending: false }),
      supabase
        .from('product')
        .select('id, name, aliases, favourite, default_price_paise, track_stock, category, base_unit, min_qty')
        .eq('household_id', h)
        .order('name'),
      supabase.from('lot').select('*').eq('household_id', h).order('received_at'),
      supabase.from('stock_move').select('*').eq('household_id', h).order('occurred_at'),
      supabase.from('product_uom').select('*').eq('household_id', h),
      supabase
        .from('shopping_item')
        .select('*')
        .eq('household_id', h)
        .order('done_at', { ascending: true, nullsFirst: true })
        .order('created_at'),
      supabase.from('month_close').select('*').eq('household_id', h).order('month'),
      supabase.from('duty').select('*').eq('household_id', h).order('created_at'),
      supabase.from('chore_event').select('*').eq('household_id', h).order('due_on'),
      supabase.from('notification_pref').select('id, member_id, trigger, mode').eq('household_id', h),
    ]);
  // ponytail: loads the whole household every time; page by month once a flat has years of rows
  // The kitty's tables are fatal — without them there is no flat. The stock tables and month_close
  // are not: a web build that reaches live before the migration does must degrade to "no stock",
  // "nothing closed", "no duties" or "every notification at its default", never to the create-a-flat screen (_layout routes `!!session && !data` to welcome).
  for (const r of [household, members, absences, spends, lines, entries, products]) if (r.error) throw r.error;
  return {
    household: household.data,
    me,
    members: members.data!,
    absences: absences.data!,
    spends: spends.data!,
    lines: lines.data!,
    entries: entries.data!,
    products: products.data!,
    lots: lots.data ?? [],
    moves: moves.data ?? [],
    uoms: uoms.data ?? [],
    shopping: shopping.data ?? [],
    closes: closes.data ?? null,
    duties: duties.data ?? [],
    choreEvents: choreEvents.data ?? [],
    prefs: prefs.data ?? [],
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

  // Tabs stay mounted, so useFocusEffect never fires when the flat reopens a backgrounded
  // Home Screen install — that resume is the stale-data case the focus reloads cannot see.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onShow = () => document.visibilityState === 'visible' && void reload();
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [reload]);

  const books = useMemo<Books | null>(
    () =>
      data
        ? {
            members: data.members,
            absences: data.absences,
            spends: data.spends,
            entries: data.entries,
            monthlyTopupPaise: data.household.monthly_topup_paise,
            lines: data.lines,
            products: data.products,
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
