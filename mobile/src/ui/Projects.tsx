import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Project, ProjectRecordGroup, ProjectRecords } from '../scm/projects-contract';
import { Icon, type } from './Primitives';
import { useReducedMotion } from './motion';
import { color } from './theme';

export function ProjectRow({ item, index, onPress }: { item: Project; index: number; onPress: () => void }) {
  const reduced = useReducedMotion();
  const [entry] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced) {
      entry.setValue(1);
      scale.setValue(1);
      return;
    }
    const transition = Animated.timing(entry, {
      toValue: 1, duration: 360, delay: Math.min(index, 5) * 24,
      easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true,
    });
    transition.start();
    return () => { transition.stop(); scale.stopAnimation(); };
  }, [entry, index, reduced, scale]);

  function press(toValue: number) {
    if (reduced) return;
    Animated.spring(scale, { toValue, damping: 24, stiffness: 350, mass: 0.85, useNativeDriver: true }).start();
  }

  return <Animated.View style={{
    opacity: reduced ? 1 : entry,
    transform: [
      { translateY: reduced ? 0 : entry.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
      { scale: reduced ? 1 : scale },
    ],
  }}>
    <Pressable accessibilityRole="button" testID={`project-${item.id}`} onPress={onPress}
      onPressIn={() => press(0.982)} onPressOut={() => press(1)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.copy}>
        {item.reference ? <Text style={type.eyebrow}>{item.reference}</Text> : null}
        <Text style={styles.title}>{item.name || 'Unnamed project'}</Text>
        {item.customer ? <Text style={type.caption}>{item.customer}</Text> : null}
      </View>
      <Icon name="arrow" tint={color.blue} />
    </Pressable>
  </Animated.View>;
}

export function ProjectRecordList({ records }: { records: ProjectRecords }) {
  const groups: [string, ProjectRecordGroup][] = [
    ['Requirement documents', records.requirements], ['Understanding documents', records.understanding], ['Kickoff meetings', records.kickoff],
  ];
  const available = groups.filter(([, group]) => group.items.length > 0);
  if (!available.length) return <Text style={type.body}>This project has no linked records.</Text>;
  return <View style={styles.groups}>
    {available.map(([label, group]) => <View key={label} style={styles.group}>
      <Text accessibilityRole="header" style={styles.title}>{label}</Text>
      <View style={styles.register}>
        {group.items.map((item, index) => <View key={item.id} style={[styles.record, index > 0 && styles.divided]}>
          {item.reference || item.format ? <Text style={styles.title}>{item.reference || item.format}</Text> : null}
          {item.status ? <Text style={type.eyebrow}>{item.status}</Text> : null}
          <Text style={type.caption}>{item.date || 'Date unavailable'}</Text>
        </View>)}
      </View>
      {group.hasMore ? <Text style={type.caption}>Showing the 20 most recent records.</Text> : null}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', gap: 16, alignItems: 'center', borderColor: color.edge, borderWidth: 1,
    borderRadius: 8, backgroundColor: color.panel, padding: 16 },
  pressed: { backgroundColor: color.raised },
  copy: { flex: 1, gap: 4 },
  title: { color: color.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  groups: { gap: 16 },
  group: { gap: 8 },
  register: { backgroundColor: color.panel, paddingHorizontal: 16, borderRadius: 8, borderColor: color.edge, borderWidth: 1 },
  record: { paddingVertical: 12, gap: 4, minHeight: 56 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
