import { Redirect, useRouter } from 'expo-router';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSession } from '../scm/session';
import { TextAction } from '../ui/Access';
import { VeloxMark } from '../ui/Brand';
import { Action, Screen, type } from '../ui/Primitives';
import { useArrival } from '../ui/motion';
import { color } from '../ui/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const { state } = useSession();
  const introduction = useArrival(0, 12);
  const controls = useArrival(95, 12);
  if (state.kind === 'active') {
    const { capabilities } = state.session.identity;
    return <Redirect href={capabilities.includes('projects.read') ? '/projects'
      : capabilities.includes('tasks.assigned-by-me') ? '/tasks' : '/workspace'} />;
  }
  return <Screen>
    <View style={styles.main}>
      <Animated.View style={[styles.introduction, introduction]}>
        <VeloxMark prominent />
        <Text accessibilityRole="header" style={styles.title}>PMS</Text>
        <Text style={type.body}>Your projects, assigned work, and service incidents in one workspace.</Text>
      </Animated.View>
      <Animated.View style={[styles.controls, controls]}>
        <Action label={state.kind === 'starting' ? 'Checking session…' : 'Sign in'} testID="open-sign-in" busy={state.kind === 'starting'} onPress={() => router.navigate('/sign-in')} />
        <TextAction label="Check server connection" testID="open-connection" onPress={() => router.navigate('/connection')} />
      </Animated.View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  main: { flexGrow: 1, justifyContent: 'center', paddingVertical: 32, gap: 24 },
  introduction: { gap: 16 }, controls: { gap: 4 },
  title: { color: color.text, fontSize: 42, lineHeight: 49, letterSpacing: -1.2, fontWeight: '700' },
});
