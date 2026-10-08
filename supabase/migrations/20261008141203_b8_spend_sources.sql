-- B8: the spend source enum covers the five quick-commerce apps, not just Zepto.
-- The screenshot reader was never Zepto-specific (supabase/functions/extract-spend/index.ts:29);
-- one CHECK was. This widens the allowed set — every existing 'zepto' | 'local' | 'other' row
-- stays valid and nothing is rewritten.
alter table public.spend drop constraint spend_source_check;
alter table public.spend add constraint spend_source_check check (
  source in ('zepto', 'blinkit', 'instamart', 'bigbasket', 'jiomart', 'local', 'other')
);
