import { Stack } from 'expo-router';
import { useReducedMotion } from '../../../ui/motion';
import { color } from '../../../ui/theme';

export default function ProjectsLayout() {
  const reduced = useReducedMotion();
  return <Stack screenOptions={{ headerShown: false, animation: reduced ? 'none' : 'slide_from_right', contentStyle: { backgroundColor: color.base } }} />;
}
