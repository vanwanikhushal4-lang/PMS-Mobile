import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { frontendPreview } from '../../scm/auth-config';
import { useSession } from '../../scm/session';
import { Icon } from '../../ui/Primitives';
import { useReducedMotion } from '../../ui/motion';
import { color } from '../../ui/theme';

export default function WorkLayout() {
  const { state } = useSession();
  const reduced = useReducedMotion();
  if (state.kind !== 'active') return null;
  const { capabilities } = state.session.identity;
  return <View style={{ flex: 1 }}>
    <Tabs safeAreaInsets={frontendPreview ? { bottom: 0 } : undefined} screenOptions={{
    headerShown: false,
    animation: reduced ? 'none' : 'fade',
    tabBarActiveTintColor: color.blue,
    tabBarInactiveTintColor: color.subtle,
    tabBarStyle: { backgroundColor: color.panel, borderTopColor: color.edge },
    tabBarLabelStyle: { fontWeight: '600' },
    sceneStyle: { backgroundColor: color.base },
  }}>
    <Tabs.Protected guard={capabilities.includes('projects.read')}>
      <Tabs.Screen name="projects" options={{ title: 'Projects', tabBarIcon: ({ color }) => <Icon name="projects" tint={color} size={23} /> }} />
    </Tabs.Protected>
    <Tabs.Protected guard={capabilities.includes('tasks.assigned-by-me')}>
      <Tabs.Screen name="tasks" options={{ title: 'My work', tabBarIcon: ({ color }) => <Icon name="work" tint={color} size={23} /> }} />
    </Tabs.Protected>
    <Tabs.Screen name="workspace" options={{ title: 'Service', tabBarIcon: ({ color }) => <Icon name="service" tint={color} size={23} /> }} />
    <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color }) => <Icon name="profile" tint={color} size={23} /> }} />
    </Tabs>
    {frontendPreview ? <SafeAreaView edges={['bottom']} style={{ backgroundColor: color.raised, paddingHorizontal: 16, paddingTop: 8 }}>
      <Text style={{ color: color.subtle, fontSize: 12, textAlign: 'center' }}>Frontend preview · Sample data · Resets on reload</Text>
    </SafeAreaView> : null}
  </View>;
}
