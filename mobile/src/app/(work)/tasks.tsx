import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { WorkspaceHeading } from '../../ui/Brand';
import { useSession } from '../../scm/session';
import { Action, DetailRecord, Screen, type } from '../../ui/Primitives';
import { TaskDatePanel } from '../../ui/TaskDatePanel';
import { TaskDateQueues } from '../../ui/TaskDateQueues';
import { TaskWorkLog } from '../../ui/TaskWorkLog';
import { WorkspaceTabs } from '../../ui/Workspace';
import { color } from '../../ui/theme';

const queues = ['To me', 'By me', 'Completed', 'Dates'] as const;

export default function AssignedTasksScreen() {
  const { state } = useSession();
  const [view, setView] = useState<{ queue: number; task: number | null }>({ queue: 0, task: null });
  const { queue, task } = view;

  return <Screen workspace keyboard>
    <WorkspaceHeading title="My work" context={state.kind === 'active' ? state.session.identity.companyName : undefined} />
    <View style={styles.content}>
      <WorkspaceTabs labels={queues} index={queue} onSelect={(index) => {
        if (queue !== index) setView({ queue: index, task: null });
      }} />
      {queue === 3 ? <TaskDateQueues initialTask={task} />
        : <TaskQueue key={queue} queue={queue} initialTask={task}
          onComplete={(id) => setView({ queue: 2, task: id })} onRequest={(id) => setView({ queue: 3, task: id })} />}
    </View>
  </Screen>;
}

function TaskQueue({ queue, initialTask, onComplete, onRequest }: {
  queue: number; initialTask: number | null; onComplete: (id: number) => void; onRequest: (id: number) => void;
}) {
  const incoming = queue === 0;
  const completed = queue === 2;
  const [confirmation, setConfirmation] = useState(initialTask ? 'Task T-' + initialTask + ' completed' : '');
  const [cursors, setCursors] = useState<number[]>([]);
  const [open, setOpen] = useState(initialTask);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return incoming ? authClient.myTasks(grant, before, signal)
      : completed ? authClient.completedTasks(grant, before, signal) : authClient.assignedTasks(grant, before, signal);
  }, [before, completed, incoming]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;

  return <>
    {confirmation ? <Phase><Text accessibilityLiveRegion="polite" style={styles.success}>{confirmation}</Text></Phase> : null}
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
            onPress={() => setOpen(open === task.id ? null : task.id)}>
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
              {task.dateAccess ? <TaskDatePanel id={task.id} onChanged={(action) => {
                if (action === 'request' && incoming) onRequest(task.id);
                else {
                  setConfirmation(action === 'request' ? 'Date request sent' : 'Dates approved');
                  reload();
                }
              }} /> : null}
              {incoming || completed ? <TaskWorkLog id={task.id} onComplete={() => onComplete(task.id)} /> : null}
              <DetailRecord rows={[
                ['Product suite', task.suite], ['Product tool', task.tool], ['Team lead', task.lead], ['Developer', task.developer],
                ['Assigned by', task.assigner],
                ...(task.dateAccess ? [] : [['Start date', task.start], ['Due date', task.due]] as const),
              ]} />
            </View>
          </Phase> : null}
        </View>)}
      </View> : <Text style={type.body}>{incoming ? 'No open tasks are assigned to you.' : completed ? 'You have no completed tasks.' : 'You haven’t assigned any tasks in this queue.'}</Text>}
      {before || next ? <View style={styles.actions}>
        {before ? <Action label="Previous page" icon="back" secondary
          onPress={() => { setOpen(null); setCursors(cursors.slice(0, -1)); }} /> : null}
        {next ? <Action label="Next page" secondary onPress={() => { setOpen(null); setCursors([...cursors, next]); }} /> : null}
      </View> : null}
    </Phase> : null}
  </>;
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
