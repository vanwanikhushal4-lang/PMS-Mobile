import { useEffect, useState } from 'react';
import { Animated, Easing, I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import type { IncidentActivity, Workspace } from '../scm/workspace-contract';
import { GlassLayer, useGlassControls } from './Glass';
import { type } from './Primitives';
import { useReducedMotion } from './motion';
import { color } from './theme';

const numbers = new Intl.NumberFormat();
const activityDate = new Intl.DateTimeFormat(undefined, {
  timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function WorkspaceTabs({ labels, index, onSelect }: { labels: readonly string[]; index: number; onSelect: (index: number) => void }) {
  const reduced = useReducedMotion();
  const glass = useGlassControls();
  const [width, setWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(index));
  const tabWidth = width / labels.length;
  const distance = tabWidth * (I18nManager.isRTL ? -1 : 1);
  useEffect(() => {
    if (reduced) { position.setValue(index); return; }
    const animation = Animated.spring(position, {
      toValue: index, damping: 23, stiffness: 280, mass: 0.8, useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [index, position, reduced]);
  return <View accessibilityRole="tablist" style={[styles.tabs, glass && styles.glassTabs]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {glass ? <GlassLayer radius={26} /> : null}
    <Animated.View pointerEvents="none" aria-hidden style={[styles.tabFill, glass && styles.glassTabFill, {
      width: Math.max(0, tabWidth - (glass ? 8 : 0)),
      transform: [{ translateX: reduced ? distance * index : position.interpolate({ inputRange: [0, 1], outputRange: [0, distance] }) }],
    }]}>
      {glass && tabWidth > 8 ? <GlassLayer radius={22} accent /> : null}
    </Animated.View>
    {labels.map((label, tab) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: index === tab }}
      testID={`workspace-${label.toLowerCase()}`} onPress={() => onSelect(tab)}
      style={({ pressed }) => [styles.tab, pressed && (glass ? styles.glassPressed : styles.pressed)]}>
      <Text style={[styles.tabLabel, index === tab && styles.tabSelected]}>{label}</Text>
    </Pressable>)}
  </View>;
}

export function IncidentOverview({ data }: { data: Workspace }) {
  return <>
    <View style={styles.summary}>
      <Text style={type.body}>Total reported</Text>
      <Text testID="workspace-total" style={styles.total}>{numbers.format(data.total)}</Text>
      {data.total === 0 ? <Text style={type.body}>You haven’t reported any incidents.</Text> : null}
    </View>
    {data.statuses.length ? <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.sectionLabel}>By status</Text>
      {data.statuses.map(({ status, count }, index) => <View key={status === null ? 'missing' : `status-${status}`} style={styles.status}>
        <View style={styles.statusLine}>
          <Text style={styles.statusName}>{status ?? 'Status unavailable'}</Text>
          <Text style={styles.statusCount}>{numbers.format(count)}</Text>
        </View>
        <StatusBar ratio={count / data.total} delay={Math.min(index, 5) * 32} />
      </View>)}
    </View> : null}
  </>;
}

function StatusBar({ ratio, delay }: { ratio: number; delay: number }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? ratio : 0));
  useEffect(() => {
    if (reduced) { progress.setValue(ratio); return; }
    const animation = Animated.timing(progress, {
      toValue: ratio, delay, duration: 520, easing: Easing.bezier(0.18, 0.78, 0.26, 1), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, ratio, reduced]);
  return <View aria-hidden style={styles.bar}>
    <Animated.View style={[styles.barFill, { transform: [{ scaleX: reduced ? ratio : progress }] }]} />
  </View>;
}

export function IncidentActivityList({ items }: { items: IncidentActivity[] }) {
  if (!items.length) return <Text style={type.body}>You don’t have any incident updates yet.</Text>;
  return <View style={styles.group}>
    <Text style={type.body}>Latest update for each incident</Text>
    <View style={styles.ledger}>
      {items.map(({ incidentId, date, status, message }, index) => <View key={incidentId}
        style={[styles.entry, index > 0 && styles.ruled]}>
        <View style={styles.entryTop}>
          <Text style={styles.incidentId}>{incidentId}</Text>
          {status ? <Text style={styles.entryStatus}>{status}</Text> : null}
        </View>
        <Text style={type.caption}>{date ? activityDate.format(new Date(`${date}Z`)) : 'Date unavailable'}</Text>
        {message ? <Text style={type.body}>{message}</Text> : null}
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row', borderRadius: 8, overflow: 'hidden', marginBottom: 24,
    backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1,
  },
  glassTabs: { minHeight: 52, borderRadius: 26, borderWidth: 0, backgroundColor: 'transparent', overflow: 'visible' },
  tabFill: { position: 'absolute', top: 0, bottom: 0, start: 0, backgroundColor: color.raised, borderBottomColor: color.blue, borderBottomWidth: 2 },
  glassTabFill: { top: 4, bottom: 4, start: 4, borderRadius: 22, backgroundColor: 'transparent', borderBottomWidth: 0 },
  tab: { flex: 1, minHeight: 48, paddingHorizontal: 4, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { color: color.muted, fontSize: 15, fontWeight: '500', textAlign: 'center' },
  tabSelected: { color: color.text, fontWeight: '700' },
  pressed: { backgroundColor: color.edge },
  glassPressed: { opacity: 0.75 },
  summary: { backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1, borderRadius: 12, padding: 20, gap: 4 },
  total: { color: color.blue, fontSize: 56, fontWeight: '500', fontVariant: ['tabular-nums'], lineHeight: 64, letterSpacing: -2 },
  group: { gap: 12 },
  sectionLabel: { color: color.text, fontSize: 18, fontWeight: '600' },
  status: { gap: 8, paddingVertical: 4 },
  statusLine: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' },
  statusName: { flex: 1, color: color.text, fontSize: 16, lineHeight: 24 },
  statusCount: { color: color.text, fontSize: 16, fontVariant: ['tabular-nums'], fontWeight: '600' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: color.edge },
  barFill: { ...StyleSheet.absoluteFill, backgroundColor: color.blue, transformOrigin: I18nManager.isRTL ? 'right center' : 'left center' },
  ledger: { paddingHorizontal: 16, borderRadius: 12, borderColor: color.edge, borderWidth: 1, backgroundColor: color.panel },
  entry: { paddingVertical: 16, gap: 4 },
  ruled: { borderTopColor: color.edge, borderTopWidth: StyleSheet.hairlineWidth },
  entryTop: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4 },
  incidentId: { color: color.text, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  entryStatus: { color: color.blue, fontSize: 14, fontWeight: '500' },
});
