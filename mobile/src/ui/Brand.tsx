import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type PropsWithChildren } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useReducedMotion } from './motion';

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

const styles = StyleSheet.create({
  plate: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7FA' },
  largePlate: { width: 44, height: 44, borderRadius: 12 },
  mark: { width: 20, height: 20 },
  largeMark: { width: 29, height: 29 },
  bar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  navigation: { flexShrink: 1 },
});
