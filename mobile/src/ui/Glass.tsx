import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';

const GlassControls = createContext(false);
export const NativeTabBar = createContext(false);

export function hasNativeGlass() {
  return Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}

export function GlassProvider({ children }: PropsWithChildren) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!hasNativeGlass()) return;
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (reduced) => {
      receivedChange = true;
      setEnabled(!reduced);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then((reduced) => {
      if (active && !receivedChange) setEnabled(!reduced);
    }, () => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return <GlassControls.Provider value={enabled}>{children}</GlassControls.Provider>;
}

export function useGlassControls() {
  return useContext(GlassControls);
}

export function GlassLayer({ radius, accent = false }: { radius: number; accent?: boolean }) {
  const enabled = useGlassControls();
  if (!enabled) return null;
  return <GlassView
    pointerEvents="none"
    accessibilityElementsHidden
    glassEffectStyle="regular"
    colorScheme="dark"
    tintColor={accent ? 'rgba(73, 139, 234, 0.47)' : undefined}
    style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
  />;
}
