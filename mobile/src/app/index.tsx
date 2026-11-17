import { Redirect, useRouter } from 'expo-router';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../scm/session';
import { TextAction } from '../ui/Access';
import { VeloxMark } from '../ui/Brand';
import { Action, Screen, type } from '../ui/Primitives';
import { useArrival } from '../ui/motion';
import { color } from '../ui/theme';

const operations = [
  ['01', 'Projects', 'Assignment and delivery'],
  ['02', 'Sales', 'Proposals and approvals'],
  ['03', 'Service desk', 'Incidents and requests'],
] as const;

export default function WelcomeScreen() {
  const router = useRouter();
  const { state } = useSession();
  const introduction = useArrival(0, 12);
  const register = useArrival(55, 16);
  const controls = useArrival(110, 12);
  if (state.kind === 'active') return <Redirect href="/workspace" />;
  return <Screen>
    <Animated.View style={[styles.masthead, introduction]}>
      <VeloxMark prominent />
      <Text style={styles.wordmark}>SCM Mobile</Text>
    </Animated.View>
    <View style={styles.main}>
      <Animated.View style={[styles.introduction, introduction]}>
        <Text style={type.eyebrow}>SCM workspace</Text>
        <Text accessibilityRole="header" style={type.title}>Projects, sales and service</Text>
        <Text style={type.body}>Start with your company code and SCM account</Text>
      </Animated.View>
      <Animated.View style={[styles.register, register]} accessible accessibilityLabel="SCM areas: Projects, Sales and Service desk">
        <Text style={styles.registerTitle}>Operations register</Text>
        {operations.map(([ref, name, detail]) => <View key={ref} style={styles.row}>
          <Text style={styles.reference}>{ref}</Text><View style={styles.rowBody}><Text style={styles.rowTitle}>{name}</Text><Text style={type.caption}>{detail}</Text></View>
        </View>)}
      </Animated.View>
      <Animated.View style={[styles.controls, controls]}>
        <Action label={state.kind === 'starting' ? 'Checking session…' : 'Sign in'} testID="open-sign-in" busy={state.kind === 'starting'} onPress={() => router.navigate('/sign-in')} />
        <TextAction label="Check server connection" testID="open-connection" onPress={() => router.navigate('/connection')} />
      </Animated.View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  masthead: { minHeight: 56, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.edge },
  wordmark: { color: color.text, fontSize: 16, fontWeight: '600' },
  main: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32, gap: 24 },
  introduction: { gap: 8 }, controls: { gap: 4 },
  register: { borderRadius: 12, backgroundColor: color.panel, borderWidth: 1, borderColor: color.edge, overflow: 'hidden' },
  registerTitle: { paddingHorizontal: 16, paddingVertical: 12, color: color.muted, fontWeight: '500', fontSize: 13 },
  row: { paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  reference: { width: 24, color: color.blue, fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'] },
  rowBody: { flex: 1 }, rowTitle: { color: color.text, fontWeight: '500', fontSize: 15, lineHeight: 20 },
});
