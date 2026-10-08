// What the duty screens and the home row share: the flat's anchor date, today's instances, cadence
// in words, and the swipe. The rules themselves live in src/domain/duties.ts.
import { Component, useMemo, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, View } from 'react-native';

import { rota, type Duty } from '@/domain/duties';
import { istDate, type Member } from '@/domain/kitty';
import { useHousehold } from '@/lib/books';
import { today } from '@/lib/util';
import { Icon, T, usePalette } from '@/ui/kit';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every day", "Every 3 days", "Mon, Thu". Takes the two cadence columns, so a half-filled form can ask too. */
export function cadenceLabel(d: Pick<Duty, 'weekdays' | 'every_days'>): string {
  if (d.weekdays) {
    if (d.weekdays.length === 7) return 'Every day';
    return d.weekdays.length ? [...d.weekdays].sort().map((n) => WD[n]).join(', ') : 'No day picked';
  }
  return d.every_days === 1 ? 'Every day' : `Every ${d.every_days} days`;
}

/** The one line that describes a duty in the Manage list: cadence, price, how many at once, meals. */
export function dutyLine(d: Duty, forName: (id: string) => string): string {
  const bits = [
    cadenceLabel(d),
    `${d.effort_points} ${d.effort_points === 1 ? 'point' : 'points'}${d.group_size > 1 ? ' each' : ''}`,
    d.group_size > 1 ? `${d.group_size} people together` : 'one person',
  ];
  if (d.schedule === 'fixed') bits[2] = d.fixed_member_id ? `always ${forName(d.fixed_member_id).split(' ')[0]}` : 'fixed';
  if (d.roster) bits.push(`${d.roster.length} in`);
  if (d.plans_meals) bits.push('plans the meals');
  return bits.join(' · ');
}

export function useDuties() {
  const h = useHousehold();
  // ponytail: one anchor for the whole flat, the oldest duty's created date. Every-N phase is then
  // counted from that date rather than each duty's own, and a duty added mid-window picks up fair
  // share for days before it existed — the same inflation for everyone, so the order never moves.
  // Per-duty anchors would need domain/duties.ts to read created_at.
  const anchor = h.duties.reduce((a, d) => (istDate(d.created_at) < a ? istDate(d.created_at) : a), today());
  const todays = useMemo(
    () => rota(h.duties, h.members, h.absences, h.choreEvents, today(), 1, anchor),
    [h.duties, h.members, h.absences, h.choreEvents, anchor],
  );
  return { ...h, anchor, todays };
}

/** The cold-start cycle a duty's settings would produce, as lines of names. The consequence, printed. */
export function previewRota(duty: Duty, members: Member[], forName: (id: string) => string, days = 6): string[] {
  const from = today();
  return rota([duty], members, [], [], from, days, from)
    .map((r) => r.slots.map((s) => forName(s.holderId).split(' ')[0]).join(' + '))
    .filter((line) => line.length > 0);
}

const PANEL = 104;

/**
 * Swipe left to reveal one panel. ONE panel, not two: Offer is the only swipe action, and it carries
 * its word rather than a bare icon. The same action is always a button inside the row as well — a
 * swipe must never be the only way to reach an action.
 *
 * ponytail: PanResponder and Animated, both core React Native. react-native-gesture-handler is
 * installed but has no provider mounted at the root, and one row's swipe is not worth wrapping the
 * whole app for. A class, because the gesture's position and its open flag are mutable state that
 * is never rendered — exactly what react-hooks' ref and immutability rules forbid in a function
 * component.
 */
export class SwipeRow extends Component<{
  label: string;
  icon: { ios: string; android: string };
  onAction: () => void;
  children: ReactNode;
}> {
  private x = new Animated.Value(0);
  private open = false;
  private settle = (to: number) => {
    this.open = to !== 0;
    Animated.spring(this.x, { toValue: to, useNativeDriver: false, bounciness: 0, speed: 18 }).start();
  };
  private pan = PanResponder.create({
    // Only a deliberate sideways drag: a vertical flick must still scroll the list.
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_e, g) => this.x.setValue(Math.max(-PANEL, Math.min(0, (this.open ? -PANEL : 0) + g.dx))),
    onPanResponderRelease: (_e, g) => this.settle((this.open ? -PANEL : 0) + g.dx < -PANEL / 2 ? -PANEL : 0),
    onPanResponderTerminate: () => this.settle(0),
  });

  render() {
    return (
      <SwipeFrame
        label={this.props.label}
        icon={this.props.icon}
        x={this.x}
        handlers={this.pan.panHandlers}
        onAction={() => {
          this.settle(0);
          this.props.onAction();
        }}>
        {this.props.children}
      </SwipeFrame>
    );
  }
}

/** The frame, split out so the palette hook stays in a function component. */
function SwipeFrame({
  label,
  icon,
  x,
  handlers,
  onAction,
  children,
}: {
  label: string;
  icon: { ios: string; android: string };
  x: Animated.Value;
  handlers: object;
  onAction: () => void;
  children: ReactNode;
}) {
  const c = usePalette();
  return (
    <View style={{ overflow: 'hidden', borderRadius: 24 }}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: PANEL, justifyContent: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onAction}
          style={({ pressed }) => [
            { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: c.raised },
            pressed && { opacity: 0.6 },
          ]}>
          <Icon name={icon} size={20} color={c.ink} />
          <T size={13} weight="700">
            {label}
          </T>
        </Pressable>
      </View>
      <Animated.View {...handlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
