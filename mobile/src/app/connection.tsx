import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { connectionConfig } from '../scm/config';
import { probeScm, type ProbeResult } from '../scm/connection';
import { BrandedTopBar } from '../ui/Brand';
import { Action, Icon, Screen, type } from '../ui/Primitives';
import { useArrival, useReducedMotion } from '../ui/motion';
import { color } from '../ui/theme';

type CurrentStatus = ProbeResult | { kind: 'idle' | 'checking' | 'invalid' | 'unconfigured' };

function statusText(status: CurrentStatus): [string, string, string] {
  switch (status.kind) {
    case 'idle': return ['Ready to check', 'Request the public SCM login page to confirm this address.', color.blue];
    case 'checking': return ['Checking server', 'Waiting for the SCM login page.', color.blue];
    case 'reachable': return ['SCM is reachable', 'The server returned the expected login page. No account was signed in.', color.success];
    case 'http': return ['Server returned an error', `The SCM address replied with HTTP ${status.status}.`, color.error];
    case 'not-scm': return ['Unexpected page', 'The address replied, but the response did not match the SCM login page.', color.error];
    case 'timeout': return ['Server timed out', 'Check the connection and try again.', color.error];
    case 'unreachable': return ['Could not reach SCM', 'Check that the server is running and this device can access it.', color.error];
    case 'unconfigured': return ['Server not configured', 'Set EXPO_PUBLIC_SCM_URL to your SCM address when building the app.', color.error];
    case 'invalid': return ['Server address is invalid', 'Use an HTTPS SCM URL without credentials, query parameters, or fragments.', color.error];
    case 'cancelled': return ['Check cancelled', 'You can start another check.', color.blue];
  }
}

export default function ConnectionScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<CurrentStatus>({ kind: connectionConfig.kind === 'configured' ? 'idle' : connectionConfig.kind });
  const reduced = useReducedMotion();
  const pending = useRef<AbortController | null>(null);
  const heading = useArrival(10);
  const panel = useArrival(86);
  const buttons = useArrival(145);
  const check = useCallback(async () => {
    if (connectionConfig.kind !== 'configured' || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setStatus({ kind: 'checking' });
    const next = await probeScm(connectionConfig.url, { signal: controller.signal });
    if (pending.current === controller) {
      pending.current = null;
      setStatus(next);
      if (Platform.OS === 'ios') {
        // iOS does not consistently read live regions on state changes.
        AccessibilityInfo.announceForAccessibility(statusText(next)[0]);
      }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void check();
    return () => {
      const request = pending.current;
      pending.current = null;
      request?.abort();
    };
  }, [check]));
  const [label, detail, tint] = statusText(status);
  const busy = status.kind === 'checking';

  return <Screen>
    <Animated.View style={[styles.heading, heading]}>
      <View style={styles.navigation}>
        <BrandedTopBar>
          <Pressable testID="connection-back" accessibilityRole="button" accessibilityLabel="Back to SCM Mobile"
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}><Icon name="back" /></Pressable>
        </BrandedTopBar>
      </View>
      <Text style={type.eyebrow}>Connectivity</Text>
      <Text accessibilityRole="header" style={[type.title, styles.title]}>Server connection</Text>
      <Text style={type.body}>Check whether this device can reach the SCM service before signing in.</Text>
    </Animated.View>

    <Animated.View style={[styles.card, panel]}>
      <View style={styles.icon}><Icon name="link" /></View>
      <Text style={styles.cardLabel}>SCM address</Text>
      <Text selectable style={styles.address}>{connectionConfig.kind === 'configured' ? connectionConfig.url.href : 'Not configured'}</Text>
      <View style={styles.divider} />
      <View style={styles.statusHeader}>
        {busy && !reduced ? <ActivityIndicator size="small" color={tint} /> : <View style={[styles.dot, { backgroundColor: tint }]} />}
        <Text testID="connection-status" accessibilityLiveRegion="polite" style={[styles.statusLabel, { color: tint }]}>{label}</Text>
      </View>
      <Text style={type.caption}>{detail}</Text>
    </Animated.View>

    <Animated.View style={[styles.buttons, buttons]}>
      {connectionConfig.kind === 'configured' && <Action label={busy ? 'Checking…' : 'Check again'} icon="refresh" busy={busy}
        testID="retry-connection" onPress={() => void check()} />}
    </Animated.View>
  </Screen>;
}

const styles = StyleSheet.create({
  heading: { gap: 8, marginBottom: 24 },
  navigation: { marginBottom: 16 },
  back: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 36 },
  card: { backgroundColor: color.panel, borderWidth: 1, borderColor: color.edge, borderRadius: 12, padding: 20, gap: 8 },
  icon: { width: 40, height: 40, borderRadius: 8, backgroundColor: color.raised, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  cardLabel: { color: color.muted, fontSize: 13, fontWeight: '500' },
  address: { color: color.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.edge, marginVertical: 8 },
  statusHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  statusLabel: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  buttons: { marginTop: 16 },
});
