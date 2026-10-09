// The Spending screen's pieces. Every figure arrives already computed by src/domain/stats.ts, so
// nothing here does money maths beyond turning paise into a bar width.
//
// Dataviz rules (DESIGN.md): magnitude is length, never hue; colour never carries meaning without a
// word beside it; brass is spent once, on the selected month's bar. No donut — a proportional bar,
// the amount and an integer percent on every row say the same thing to a colourblind reader.
import { View } from 'react-native';

import { formatINR } from '@/domain/money';
import { monthLabel } from '@/lib/util';
import { Rule, SectionLabel, T, usePalette } from '@/ui/kit';

const CHART_H = 120;

/** The month strip. The selected months are filled brass; the rest recede. A zero month is a hollow dot. */
export function MonthBars({ series, selected }: { series: { month: string; paise: number }[]; selected: Set<string> }) {
  const c = usePalette();
  const peak = Math.max(...series.map((m) => m.paise), 1);
  const peakMonth = series.find((m) => m.paise === peak);
  // a selected month with nothing in it is a hollow dot, so the note must explain the dot, not the fill
  const anyEmpty = series.some((m) => selected.has(m.month) && m.paise === 0);

  return (
    <View style={{ gap: 8 }}>
      <T size={12} soft num>
        {formatINR(peak)}
      </T>
      {/* the dashed line sits on the biggest month, which is why the tallest bar touches it */}
      <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: c.line }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }} role="list">
        {series.map((m) => {
          const on = selected.has(m.month);
          const h = Math.max(4, Math.round((m.paise / peak) * CHART_H));
          return (
            <View
              key={m.month}
              role="listitem"
              accessible
              accessibilityLabel={`${monthLabel(m.month)}, ${formatINR(m.paise)}`}
              style={{ flex: 1, alignItems: 'center', gap: 6, minWidth: 0 }}>
              <View style={{ height: CHART_H, width: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                {m.paise > 0 ? (
                  <View style={{ width: '82%', height: h, borderRadius: 6, backgroundColor: on ? c.accent : c.raised }} />
                ) : (
                  <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.muted }} />
                )}
              </View>
              <T size={12} weight={on ? '700' : '600'} color={on ? c.ink : c.muted} numberOfLines={1}>
                {monthLabel(m.month).slice(0, 3)}
              </T>
            </View>
          );
        })}
      </View>
      <T size={13} soft>
        {!anyEmpty && peak > 1 && peakMonth
          ? `The filled bar is what you are looking at. The dashed line is the biggest month, ${formatINR(peak)} in ${monthLabel(peakMonth.month)}.`
          : 'A hollow dot means nothing was spent that month.'}
      </T>
    </View>
  );
}

/** Name · amount · bar · integer percent. The bar IS the percent — it used to be scaled to the
 *  biggest row, so a 38% category filled the whole track and told a different story to the number
 *  printed beside it. The empty remainder of the track reads as the rest of the money. */
export function CategoryBars({ rows }: { rows: { label: string; paise: number; pct: number }[] }) {
  const c = usePalette();
  return (
    <View style={{ gap: 14 }} role="list">
      {rows.map((r) => (
        <View
          key={r.label}
          role="listitem"
          accessible
          accessibilityLabel={`${r.label}, ${formatINR(r.paise)}, ${r.pct} per cent`}
          style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <T size={16} weight="600" style={{ flex: 1 }} numberOfLines={1}>
              {r.label}
            </T>
            <T size={16} num>
              {formatINR(r.paise)}
            </T>
            <T size={13} soft style={{ width: 38, textAlign: 'right' }}>
              {r.pct}%
            </T>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: c.hair }}>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: c.ink,
                width: `${Math.max(1, r.pct)}%`,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

/** One bar split by share, then the same shares as words. Which app or shop the money went to. */
export function SplitBar({ rows }: { rows: { label: string; note?: string; paise: number; pct: number }[] }) {
  const c = usePalette();
  const fills = [c.ink, c.muted, c.line];
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: c.hair }}>
        {rows.map((r, i) => (
          <View key={r.label} style={{ width: `${r.pct}%`, backgroundColor: fills[i % fills.length] }} />
        ))}
      </View>
      <View style={{ gap: 8 }} role="list">
        {rows.map((r, i) => (
          <View
            key={r.label}
            role="listitem"
            accessible
            accessibilityLabel={`${r.label}${r.note ? ` (${r.note})` : ''}, ${formatINR(r.paise)}, ${r.pct} per cent`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: fills[i % fills.length] }} />
            <T size={16} weight="600">
              {r.label}
            </T>
            {!!r.note && (
              <T size={13} soft numberOfLines={1} style={{ flex: 1 }}>
                {r.note}
              </T>
            )}
            <T size={16} num style={!r.note ? { flex: 1, textAlign: 'right' } : undefined}>
              {formatINR(r.paise)}
            </T>
            <T size={13} soft style={{ width: 38, textAlign: 'right' }}>
              {r.pct}%
            </T>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Who paid, in fixed alphabetical order and never ranked: own pocket beside pool used. */
export function WhoPaid({ rows }: { rows: { member_id: string; name: string; ownPocketPaise: number; poolPaise: number }[] }) {
  const c = usePalette();
  const cell = (paise: number) =>
    paise ? (
      <T size={16} num style={{ width: 92, textAlign: 'right' }}>
        {formatINR(paise)}
      </T>
    ) : (
      <T size={16} soft style={{ width: 92, textAlign: 'right' }}>
        —
      </T>
    );
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SectionLabel>Mate</SectionLabel>
        <View style={{ flex: 1 }} />
        <T size={12} soft style={{ width: 92, textAlign: 'right' }}>
          Own pocket
        </T>
        <T size={12} soft style={{ width: 92, textAlign: 'right' }}>
          Pool used
        </T>
      </View>
      <Rule />
      {rows.map((r) => (
        <View
          key={r.member_id}
          accessible
          accessibilityLabel={`${r.name} laid out ${r.ownPocketPaise ? formatINR(r.ownPocketPaise) : 'nothing'} and spent ${
            r.poolPaise ? formatINR(r.poolPaise) : 'nothing'
          } of the pool`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
          <T size={16} weight="600" style={{ flex: 1 }} numberOfLines={1}>
            {r.name}
          </T>
          {cell(r.ownPocketPaise)}
          {cell(r.poolPaise)}
        </View>
      ))}
      <T size={13} color={c.muted}>
        Alphabetical, never ranked. Own pocket is what a mate laid out and gets back; pool used is the kitty&apos;s own
        money they spent.
      </T>
    </View>
  );
}
