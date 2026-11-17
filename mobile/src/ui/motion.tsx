import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';

const ReduceMotion = createContext(true);

export function MotionProvider({ children }: PropsWithChildren) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    let eventReceived = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      eventReceived = true;
      if (live) setReduced(value);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => { if (live && !eventReceived) setReduced(value); },
      () => { if (live && !eventReceived) setReduced(true); },
    );
    return () => { live = false; subscription.remove(); };
  }, []);
  if (reduced === null) return null;
  return <ReduceMotion.Provider value={reduced}>{children}</ReduceMotion.Provider>;
}

export function useReducedMotion() {
  return useContext(ReduceMotion);
}

export function useFocusedForeground() {
  const [focused, setFocused] = useState(false);
  const [state, setState] = useState(AppState.currentState);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setState);
    return () => subscription.remove();
  }, []);
  return focused && (state === 'active' || state === null);
}

export function useArrival(delay: number, lift = 18) {
  const reduced = useReducedMotion();
  const [phase] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useFocusEffect(useCallback(() => {
    if (reduced) { phase.setValue(1); return; }
    const entrance = Animated.timing(phase, {
      toValue: 1, delay, duration: 580, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true,
    });
    entrance.start();
    return () => entrance.stop();
  }, [delay, phase, reduced]));
  return {
    opacity: reduced ? 1 : phase,
    transform: [{ translateY: reduced ? 0 : phase.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) }],
  };
}
