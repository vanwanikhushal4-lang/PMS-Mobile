import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { BrandedTopBar } from '../../ui/Brand';
import { DetailRecord, Screen, type } from '../../ui/Primitives';
import { ProjectRecordList } from '../../ui/Projects';
import { color } from '../../ui/theme';

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const idNumber = typeof id === 'string' && /^[1-9]\d{0,9}$/.test(id) ? Number(id) : 0;
  const projectId = idNumber <= 2_147_483_647 ? idNumber : 0;
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!projectId) return Promise.reject(new AuthError('not-found'));
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.project(grant, projectId, signal);
  }, [projectId]);
  const { result, reload } = useProtectedRead(read);
  const item = result.kind === 'ready' ? result.data : null;
  const missing = result.kind === 'error' && (result.code === 'not-found' || result.code === 'forbidden');

  return <Screen>
    <BrandedTopBar>
      <TextAction label="Back to projects" onPress={() => router.canGoBack() ? router.back() : router.replace('/projects')} />
    </BrandedTopBar>
    <View style={styles.content}>
      {item ? <Phase>
        <View style={styles.heading}>
          {item.reference ? <Text style={type.eyebrow}>{item.reference}</Text> : null}
          <Text accessibilityRole="header" style={type.title}>{item.name || 'Unnamed project'}</Text>
          {item.customer ? <Text style={type.body}>{item.customer}</Text> : null}
        </View>
        <DetailRecord rows={[
          ['Product suite', item.suite], ['Product tool', item.tool], ['Function', item.function], ['Responsibility', item.responsibility],
        ]} />
        <ProjectRecordsPane id={item.id} />
      </Phase> : <Text accessibilityRole="header" style={type.title}>Project</Text>}
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading project…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={missing ? 'This project is unavailable to your account.' : 'Couldn’t load this project.'} />
        {missing ? null : <TextAction label="Try again" onPress={reload} />}
      </> : null}
    </View>
  </Screen>;
}

function ProjectRecordsPane({ id }: { id: number }) {
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.projectRecords(grant, id, signal);
  }, [id]);
  const { result, reload } = useProtectedRead(read);
  const records = result.kind === 'ready' ? result.data : null;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>Documents and kickoff</Text>
    {records ? <Phase><ProjectRecordList records={records} /></Phase> : null}
    {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading linked records…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message="Couldn’t load linked records." />
      <TextAction label="Try again" onPress={reload} />
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 20, marginTop: 12 },
  heading: { gap: 8 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: color.text },
});
