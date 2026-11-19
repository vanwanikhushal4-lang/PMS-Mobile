import { useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GlassLayer, NativeTabBar, useGlassControls } from './Glass';
import { useReducedMotion } from './motion';
import { color } from './theme';

export function Icon({ name, size = 18, tint = color.muted, filled = false }: { name: 'arrow' | 'back' | 'refresh' | 'link' | 'lock' | 'check' | 'eye' | 'eye-off' | 'exit' | 'projects' | 'work' | 'service' | 'profile' | 'search' | 'bookmark'; size?: number; tint?: ColorValue; filled?: boolean }) {
  const path = {
    arrow: 'M4 12h15m-6-6 6 6-6 6', back: 'M20 12H5m6 6-6-6 6-6',
    refresh: 'M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5m-4 4a8 8 0 0 0 14 5l3-3m0 5v-5h-5',
    link: 'm10 13 4-4m-7 2-3 3a4 4 0 0 0 6 6l3-3m-2-10 3-3a4 4 0 0 1 6 6l-3 3',
    lock: 'M7 10V7a5 5 0 0 1 10 0v3m-11 0h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2m6 5v2',
    check: 'm5 12 4 4L19 6', eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
    'eye-off': 'M3 3l18 18M10.6 6.1C11 6 11.5 6 12 6c6.5 0 10 6 10 6a13 13 0 0 1-2.1 2.5M6.2 7.7A14 14 0 0 0 2 12s3.5 6 10 6a10 10 0 0 0 4-.8',
    exit: 'M10 17l5-5-5-5m5 5H3m10-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
    projects: 'M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7m0 2h18',
    work: 'M9 11l2 2 4-4m-6 8h6M8 4H6a2 2 0 0 0-2 2v14h16V6a2 2 0 0 0-2-2h-2M9 3h6v4H9z',
    service: 'M4 13v-1a8 8 0 0 1 16 0v1m-13 6H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h2zm10 0h2a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2h-2zm2 0c0 2-2 3-6 3',
    profile: 'M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2c0-3 4-5 8-5s8 2 8 5v2',
    search: 'M16 11a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-1.5 3.5L20 20',
    bookmark: 'M6 3h12v18l-6-4-6 4z',
  }[name];
  return <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <Path d={path} stroke={tint} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill={filled ? tint : 'none'} />
  </Svg>;
}

export function Screen({ children, keyboard = false, workspace = false }: PropsWithChildren<{ keyboard?: boolean; workspace?: boolean }>) {
  const nativeTabBar = useContext(NativeTabBar);
  const { bottom } = useSafeAreaInsets();
  // The floating bar can overlap a scroll view nested in a project stack.
  // Reserve room at the end while keeping content visible underneath the glass on scroll.
  const tabClearance = workspace && nativeTabBar ? { paddingBottom: bottom + 88 } : undefined;
  return <View style={styles.root}>
    <SafeAreaView style={styles.safe} edges={workspace ? ['top', 'left', 'right'] : undefined}>
      <KeyboardAvoidingView style={styles.safe} enabled={keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, workspace && styles.workspace, tabClearance]} keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </View>;
}

export function Action({ label, onPress, icon = 'arrow', secondary = false, busy = false, testID }: {
  label: string; onPress: () => void; icon?: 'arrow' | 'back' | 'refresh' | 'lock' | 'exit' | 'check'; secondary?: boolean; busy?: boolean; testID?: string;
}) {
  const reduced = useReducedMotion();
  const glass = useGlassControls();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced || busy) { scale.stopAnimation(); scale.setValue(1); }
    return () => { scale.stopAnimation(); };
  }, [busy, reduced, scale]);
  const press = (toValue: number) => {
    if (reduced) return;
    Animated.timing(scale, { toValue, duration: toValue < 1 ? 100 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  return <Animated.View style={{ transform: [{ scale: reduced ? 1 : scale }] }}>
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ busy, disabled: busy }}
      disabled={busy} onPressIn={() => press(0.984)} onPressOut={() => press(1)} onPress={onPress}
      style={({ pressed }) => [styles.action, glass ? styles.glassAction : secondary ? styles.secondary : styles.primary,
        pressed && !glass && styles.pressed]}>
      <GlassLayer radius={26} accent={!secondary} />
      <Text style={[styles.actionLabel, { color: glass || secondary ? color.text : color.onButton }]}>{label}</Text>
      <Icon name={icon} tint={secondary ? color.blue : glass ? color.text : color.onButton} />
    </Pressable>
  </Animated.View>;
}

export function DetailRecord({ rows, selectable = false }: { rows: readonly (readonly [string, string])[]; selectable?: boolean }) {
  return <View style={styles.record}>
    {rows.map(([label, value], index) => <View key={label} style={[styles.detail, index > 0 && styles.divided]}>
      <Text style={type.caption}>{label}</Text>
      <Text selectable={selectable && !!value} style={value ? styles.value : type.caption}>{value || 'Not provided'}</Text>
    </View>)}
  </View>;
}

export const type = StyleSheet.create({
  eyebrow: { color: color.cyan, fontSize: 13, fontWeight: '500' },
  title: { color: color.text, fontSize: 36, lineHeight: 44, letterSpacing: -0.7, fontWeight: '500' },
  body: { color: color.muted, fontSize: 16, lineHeight: 24 },
  caption: { color: color.subtle, fontSize: 13, lineHeight: 20 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.base },
  safe: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 525, alignSelf: 'center', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  workspace: { maxWidth: 920, paddingHorizontal: 20, paddingTop: 12 },
  action: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: 8 },
  glassAction: { minHeight: 52, borderRadius: 26, paddingHorizontal: 20 },
  primary: { backgroundColor: color.lightButton },
  secondary: { backgroundColor: color.panel, borderWidth: 1, borderColor: color.edge },
  pressed: { opacity: 0.86 },
  actionLabel: { flexShrink: 1, fontSize: 16, fontWeight: '600' },
  record: { borderRadius: 12, backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1, paddingHorizontal: 16 },
  detail: { minHeight: 56, paddingVertical: 12, justifyContent: 'center', gap: 4 },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  value: { color: color.text, fontSize: 17, fontWeight: '500' },
});
