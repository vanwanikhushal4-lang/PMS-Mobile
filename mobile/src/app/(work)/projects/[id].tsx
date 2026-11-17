import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../scm/auth-api';
import { authClient } from '../../../scm/auth-config';
import { useProtectedRead } from '../../../scm/protected-read';
import { useSession } from '../../../scm/session';
import { FormMessage, Phase, TextAction } from '../../../ui/Access';
import { BrandedTopBar } from '../../../ui/Brand';
import { DetailRecord, Screen, type } from '../../../ui/Primitives';
import { ProjectFavorite, ProjectRecordList } from '../../../ui/Projects';
import { ProjectTasks, type TaskView } from '../../../ui/ProjectTasks';
import { WorkspaceTabs } from '../../../ui/Workspace';
import { color } from '../../../ui/theme';

const views = ['List', 'Board', 'Timeline', 'Records'] as const;
const taskViews: TaskView[] = ['list', 'board', 'timeline'];

export default function ProjectDetailScreen() {
  const { state } = useSession();
  const canReadTasks = state.kind === 'active' && state.session.identity.capabilities.includes('tasks.assigned-by-me');
  const [pane, setPane] = useState({ index: 0, shift: 0 });
  const records = !canReadTasks || pane.index === 3;
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

  return <Screen keyboard workspace>
    <BrandedTopBar>
      <TextAction label="All projects" onPress={() => router.canGoBack() ? router.back() : router.replace('/projects')} />
    </BrandedTopBar>
    <View style={styles.content}>
      {item ? <Phase>
        <View style={styles.heading}>
          <View style={styles.referenceRow}>
            {item.reference ? <Text style={type.eyebrow}>{item.reference}</Text> : <View />}
            <ProjectFavorite key={item.id + ':' + item.favorite} id={item.id} saved={item.favorite} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{item.name || 'Unnamed project'}</Text>
          {item.customer ? <Text style={type.body}>{item.customer}</Text> : null}
        </View>
        {canReadTasks ? <WorkspaceTabs labels={views} index={pane.index} onSelect={(index) => setPane((current) => index === current.index ? current : {
          index, shift: 18 * Math.sign(index - current.index) * (I18nManager.isRTL ? -1 : 1),
        })} /> : null}
        {canReadTasks ? <ProjectTasks key={item.id} id={item.id} view={records ? null : taskViews[pane.index]} shift={pane.shift} /> : null}
        {records ? <Phase shift={pane.shift}>
          <DetailRecord rows={[
            ['Product suite', item.suite], ['Product tool', item.tool], ['Function', item.function], ['Responsibility', item.responsibility],
          ]} />
          <ProjectRecordsPane id={item.id} />
        </Phase> : null}
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
  referenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 12 },
  title: { color: color.text, fontSize: 30, lineHeight: 36, letterSpacing: -0.6, fontWeight: '700' },
  section: { gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: color.text },
});
