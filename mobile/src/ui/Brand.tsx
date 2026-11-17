import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type PropsWithChildren } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useArrival, useReducedMotion } from './motion';
import { color } from './theme';

const mark = require('../../assets/velox-mark.png');

export function VeloxMark({ prominent = false }: { prominent?: boolean }) {
  const reduced = useReducedMotion();
  const [phase] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useFocusEffect(useCallback(() => {
    if (reduced) {
      phase.setValue(1);
      return;
    }
    phase.setValue(0);
    const reveal = Animated.spring(phase, {
      toValue: 1,
      stiffness: 180,
      damping: 15,
      mass: 0.85,
      useNativeDriver: true,
      isInteraction: false,
    });
    reveal.start();
    return () => reveal.stop();
  }, [phase, reduced]));

  const opacity = reduced ? 1 : phase.interpolate({
    inputRange: [0, 1], outputRange: [0.2, 1], extrapolate: 'clamp',
  });
  const rotate = reduced ? '0deg' : phase.interpolate({
    inputRange: [0, 1], outputRange: ['-11deg', '0deg'],
  });
  const scale = reduced ? 1 : phase.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });

  return <View aria-hidden style={[styles.plate, prominent && styles.largePlate]}>
    <Animated.Image source={mark} resizeMode="contain" fadeDuration={0}
      style={[styles.mark, prominent && styles.largeMark, { opacity, transform: [{ rotate }, { scale }] }]} />
  </View>;
}

export function BrandedTopBar({ children }: PropsWithChildren) {
  return <View style={styles.bar}>
    <View style={styles.navigation}>{children}</View>
    <VeloxMark />
  </View>;
}

export function WorkspaceHeading({ title, context }: { title: string; context?: string }) {
  const entrance = useArrival(0, 9);
  return <Animated.View style={[styles.heading, entrance]}>
    <View style={styles.headingCopy}>
      {context ? <Text style={styles.context}>{context}</Text> : null}
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    </View>
    <VeloxMark />
  </Animated.View>;
}

const styles = StyleSheet.create({
  plate: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },
  largePlate: { width: 44, height: 44, borderRadius: 12 },
  mark: { width: 20, height: 20 },
  largeMark: { width: 29, height: 29 },
  bar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  navigation: { flexShrink: 1 },
  heading: { minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingTop: 5 },
  headingCopy: { flex: 1, gap: 5 },
  context: { color: color.blue, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  title: { color: color.text, fontSize: 32, lineHeight: 38, letterSpacing: -0.85, fontWeight: '700' },
});
