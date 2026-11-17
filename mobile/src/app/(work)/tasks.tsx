import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { WorkspaceHeading } from '../../ui/Brand';
import { BulkTaskAssignments } from '../../ui/BulkTaskAssignments';
import { useSession } from '../../scm/session';
import { Action, DetailRecord, Screen, type } from '../../ui/Primitives';
import { TaskDatePanel } from '../../ui/TaskDatePanel';
import { TaskDateQueues } from '../../ui/TaskDateQueues';
import { TaskReassignment } from '../../ui/TaskAssignmentForm';
import { StandaloneTaskForm } from '../../ui/StandaloneTaskForm';
import { TaskWorkLog } from '../../ui/TaskWorkLog';
import { WorkspaceTabs } from '../../ui/Workspace';
import { color } from '../../ui/theme';

const queues = ['To me', 'By me', 'Completed', 'Dates', 'Team'] as const;

export default function AssignedTasksScreen() {
  const { state } = useSession();
  const [view, setView] = useState<{ queue: number; task: number | null }>({ queue: 0, task: null });
  const [creating, setCreating] = useState(false);
  const { queue, task } = view;
  const canCreate = state.kind === 'active' && state.session.identity.capabilities.includes('tasks.create-standalone');

  return <Screen workspace keyboard>
    <WorkspaceHeading title={creating ? 'Create task' : 'My work'} context={state.kind === 'active' ? state.session.identity.companyName : undefined} />
    {creating ? <View style={styles.content}><StandaloneTaskForm cancel={() => setCreating(false)} onDone={(id) => {
      setView({ queue: 1, task: id });
      setCreating(false);
    }} /></View> : <View style={styles.content}>
      {canCreate ? <Action label="Create task" secondary testID="open-standalone-task" onPress={() => setCreating(true)} /> : null}
      <WorkspaceTabs labels={queues} index={queue} onSelect={(index) => {
        if (queue !== index) setView({ queue: index, task: null });
      }} />
      {queue === 3 ? <TaskDateQueues initialTask={task} />
        : <TaskQueue key={`${queue}-${task}`} queue={queue} initialTask={task}
          onComplete={(id) => setView({ queue: 2, task: id })} onRequest={(id) => setView({ queue: 3, task: id })} />}
    </View>}
  </Screen>;
}

function TaskQueue({ queue, initialTask, onComplete, onRequest }: {
  queue: number; initialTask: number | null; onComplete: (id: number) => void; onRequest: (id: number) => void;
}) {
  const incoming = queue === 0;
  const completed = queue === 2;
  const team = queue === 4;
  const [confirmation, setConfirmation] = useState(initialTask ? 'Task T-' + initialTask + (completed ? ' completed' : ' created') : '');
  const [cursors, setCursors] = useState<number[]>([]);
  const [open, setOpen] = useState(initialTask);
  const [batch, setBatch] = useState(false);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return incoming ? authClient.myTasks(grant, before, signal)
      : completed ? authClient.completedTasks(grant, before, signal)
        : team ? authClient.assignmentQueue(grant, before, signal) : authClient.assignedTasks(grant, before, signal);
  }, [before, completed, incoming, team]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;

  return <>
    {confirmation ? <Phase><Text accessibilityLiveRegion="polite" style={styles.success}>{confirmation}</Text></Phase> : null}
    {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading assigned tasks…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={result.code === 'forbidden' ? 'Your account doesn’t have access to this queue.' : 'Couldn’t load assigned tasks.'} />
      {result.code === 'forbidden' ? null : <TextAction label="Try again" onPress={reload} />}
    </> : null}
    {batch ? <BulkTaskAssignments items={result.kind === 'ready' ? result.data.items : []}
      onStale={reload} cancel={() => setBatch(false)} onDone={(count) => {
        setConfirmation(count + ' tasks reassigned');
        setBatch(false);
        reload();
      }} /> : null}
    {result.kind === 'ready' ? <Phase key={`${queue}-${before ?? 'first'}`}>
      {team && !batch && result.data.items.some((item) => item.reassignable) ? <Action label="Reassign several tasks"
        secondary testID="open-bulk-reassign" onPress={() => { setConfirmation(''); setBatch(true); }} /> : null}
      {!batch && (result.data.items.length ? <View style={styles.queue}>
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
              {task.reassignable ? <TaskReassignment id={task.id} onDone={() => {
                setConfirmation('Task T-' + task.id + ' reassigned');
                reload();
              }} /> : null}
              {incoming || completed ? <TaskWorkLog id={task.id} onComplete={() => onComplete(task.id)} /> : null}
              <DetailRecord rows={[
                ['Product suite', task.suite], ['Product tool', task.tool], ['Team lead', task.lead], ['Developer', task.developer],
                ['Assigned by', task.assigner],
                ...(task.reference ? [['SCM reference', task.reference]] as const : []),
                ...(task.function ? [['Function', task.function]] as const : []),
                ...(task.responsibility ? [['Responsibility', task.responsibility]] as const : []),
                ...(task.priority ? [['Priority', task.priority]] as const : []),
                ...(task.weight ? [['Weight', task.weight + '%']] as const : []),
                ...(task.dateAccess ? [] : [['Start date', task.start], ['Due date', task.due]] as const),
              ]} />
            </View>
          </Phase> : null}
        </View>)}
      </View> : <Text style={type.body}>{team ? 'You have no team tasks available to reassign.'
        : incoming ? 'No open tasks are assigned to you.' : completed ? 'You have no completed tasks.' : 'You haven’t assigned any tasks in this queue.'}</Text>)}
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
