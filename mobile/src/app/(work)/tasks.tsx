import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { WorkspaceHeading } from '../../ui/Brand';
import { useSession } from '../../scm/session';
import { Action, DetailRecord, Screen, type } from '../../ui/Primitives';
import { TaskWorkLog } from '../../ui/TaskWorkLog';
import { WorkspaceTabs } from '../../ui/Workspace';
import { color } from '../../ui/theme';

const queues = ['To me', 'By me', 'Completed'] as const;

export default function AssignedTasksScreen() {
  const { state } = useSession();
  const [queue, setQueue] = useState(0);
  const incoming = queue === 0;
  const completed = queue === 2;
  const [confirmation, setConfirmation] = useState(0);
  const [cursors, setCursors] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return incoming ? authClient.myTasks(grant, before, signal)
      : completed ? authClient.completedTasks(grant, before, signal) : authClient.assignedTasks(grant, before, signal);
  }, [before, completed, incoming]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;

  function didComplete(id: number) {
    setConfirmation(id);
    setQueue(2);
    setOpen(id);
    setCursors([]);
  }

  return <Screen workspace keyboard>
    <WorkspaceHeading title="My work" context={state.kind === 'active' ? state.session.identity.companyName : undefined} />
    <View style={styles.content}>
      <WorkspaceTabs labels={queues} index={queue} onSelect={(index) => {
        if (index !== queue) { setQueue(index); setCursors([]); setOpen(null); setConfirmation(0); }
      }} />
      {confirmation ? <Phase><Text accessibilityLiveRegion="polite" style={styles.success}>Task T-{confirmation} completed</Text></Phase> : null}
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading assigned tasks…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'Your account doesn’t have access to this queue.' : 'Couldn’t load assigned tasks.'} />
        {result.code === 'forbidden' ? null : <TextAction label="Try again" onPress={reload} />}
      </> : null}
      {result.kind === 'ready' ? <Phase key={`${queue}-${before ?? 'first'}`}>
        {result.data.items.length ? <View style={styles.queue}>
          {result.data.items.map((task) => <View key={task.id} style={styles.task}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === task.id }}
              style={({ pressed }) => [styles.summary, pressed && styles.pressed]} testID={`assigned-task-${task.id}`}
              onPress={() => setOpen((current) => current === task.id ? null : task.id)}>
              <View style={styles.refLine}>
                <Text style={type.eyebrow}>T-{task.id}</Text>
                {task.status ? <Text style={type.eyebrow}>{task.status}</Text> : null}
              </View>
              <Text style={styles.taskTitle}>{task.module || 'Unnamed task'}</Text>
              {task.customer ? <Text style={type.caption}>{task.customer}</Text> : null}
            </Pressable>
            {open === task.id ? <Phase>
              <View style={styles.details}>
                {task.description ? <Text style={type.body}>{task.description}</Text> : null}
                {incoming || completed ? <TaskWorkLog id={task.id} onComplete={() => didComplete(task.id)} /> : null}
                <DetailRecord rows={[
                  ['Product suite', task.suite], ['Product tool', task.tool], ['Team lead', task.lead], ['Developer', task.developer],
                  ['Assigned by', task.assigner], ['Start date', task.start], ['Due date', task.due],
                ]} />
              </View>
            </Phase> : null}
          </View>)}
        </View> : <Text style={type.body}>{incoming ? 'No open tasks are assigned to you.' : completed ? 'You have no completed tasks.' : 'You haven’t assigned any tasks in this queue.'}</Text>}
        {before || next ? <View style={styles.actions}>
          {before ? <Action label="Previous page" icon="back" secondary
            onPress={() => { setOpen(null); setCursors((pages) => pages.slice(0, -1)); }} /> : null}
          {next ? <Action label="Next page" secondary onPress={() => { setOpen(null); setCursors((pages) => [...pages, next]); }} /> : null}
        </View> : null}
      </Phase> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 20, marginTop: 12 },
  queue: { gap: 8 },
  task: { borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel, overflow: 'hidden' },
  summary: { padding: 16, minHeight: 64, gap: 4 },
  pressed: { backgroundColor: color.raised },
  refLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', columnGap: 16 },
  taskTitle: { color: color.text, fontSize: 17, fontWeight: '600' },
  details: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  success: { color: color.success, fontSize: 16, fontWeight: '600' },
});
