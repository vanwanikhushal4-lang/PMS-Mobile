import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { GlassProvider } from '../ui/Glass';
import { MotionProvider, useReducedMotion } from '../ui/motion';
import { color } from '../ui/theme';
import { SessionProvider, useSession } from '../scm/session';

function Routes() {
  const reduced = useReducedMotion();
  const { state } = useSession();
  return <>
    <StatusBar style="light" />
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: color.base },
      animation: reduced ? 'none' : 'fade_from_bottom',
    }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="connection" />
      <Stack.Protected guard={state.kind === 'signed-out'}><Stack.Screen name="sign-in" /></Stack.Protected>
      <Stack.Protected guard={state.kind === 'active'}>
        <Stack.Screen name="(work)" />
      </Stack.Protected>
    </Stack>
  </>;
}

export default function RootLayout() {
  return <View style={styles.root}>
    <MotionProvider><GlassProvider><SessionProvider><Routes /></SessionProvider></GlassProvider></MotionProvider>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: color.base } });
