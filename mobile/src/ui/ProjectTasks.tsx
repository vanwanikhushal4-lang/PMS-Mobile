import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, I18nManager, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { scheduleLabel, taskSchedule } from '../scm/project-schedule';
import { useSession } from '../scm/session';
import type { AssignedTask } from '../scm/tasks-contract';
import { FormMessage, Phase, SearchField, TextAction } from './Access';
import { Action, DetailRecord, type } from './Primitives';
import { TaskDatePanel } from './TaskDatePanel';
import { TaskAssignmentForm, TaskReassignment } from './TaskAssignmentForm';
import { TaskWorkLog } from './TaskWorkLog';
import { useReducedMotion } from './motion';
import { color } from './theme';

const lanes = [
  { name: 'To do', tint: '#A6BDDB', statuses: ['new', 'pending', 'open', 'to do', 'not started', 'backlog'] },
  { name: 'In progress', tint: '#85B9FF', statuses: ['in progress', 'working', 'started', 'in development'] },
  { name: 'Done', tint: '#85DCB2', statuses: ['done', 'complete', 'completed', 'closed', 'resolved'] },
  { name: 'Other', tint: '#DCC286', statuses: [] },
] as const;

export type TaskView = 'list' | 'board' | 'timeline';

function laneIndex(status: string) {
  const normalized = status.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  const index = lanes.findIndex((lane) => lane.statuses.some((value) => value === normalized));
  return index < 0 ? lanes.length - 1 : index;
}

function taskName(task: AssignedTask) {
  return task.module || 'Task ' + task.id;
}

export function ProjectTasks({ id, view, shift }: { id: number; view: TaskView | null; shift: number }) {
  const { state } = useSession();
  const reduced = useReducedMotion();
  const canCreate = state.kind === 'active' && state.session.identity.capabilities.includes('tasks.create');
  const [creating, setCreating] = useState(false);
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [cursors, setCursors] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.projectTasks(grant, id, { query: term, before }, signal);
  }, [before, id, term]);
  const { result, reload } = useProtectedRead(read);
  const data = result.kind === 'ready' ? result.data : null;
  const selectedTask = data?.items.find((task) => task.id === selected);
  const open = (task: AssignedTask) => {
    setConfirmation('');
    setSelected(task.id);
  };

  function search(value: string) {
    Keyboard.dismiss();
    setTerm(value.trim());
    setCursors([]);
    setSelected(null);
  }

  if (!view) return null;

  return <View style={styles.pane}>
    {canCreate ? <TextAction label="Create task" testID="open-create-task" onPress={() => {
      setConfirmation('');
      setCreating(true);
    }} /> : null}
    <SearchField label="Search project tasks" placeholder="Task, assignee or status" value={input}
      onChange={setInput} onSubmit={() => search(input)} testID="project-task-search"
      onClear={input || term ? () => { setInput(''); search(''); } : undefined} />
    {confirmation ? <Phase><Text accessibilityLiveRegion="polite" style={styles.success}>{confirmation}</Text></Phase> : null}
    {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading project tasks…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={result.code === 'forbidden' || result.code === 'not-found'
        ? 'These tasks are unavailable to your account.' : 'Couldn’t load project tasks.'} />
      {result.code !== 'forbidden' && result.code !== 'not-found' ? <TextAction label="Try again" onPress={reload} /> : null}
    </> : null}
    {data ? <Phase key={view + ':' + (before ?? 0) + ':' + term} shift={shift}>
      {data.items.length === 0 ? <View style={styles.empty}>
        <Text style={type.body}>{term ? 'No tasks match your search.' : 'No tasks are linked to this project for your account.'}</Text>
      </View> : view === 'board' ? <Board tasks={data.items} open={open} />
        : view === 'timeline' ? <Timeline tasks={data.items} open={open} />
          : <View style={styles.register}>{data.items.map((task) => <TaskButton key={task.id} task={task} open={open} />)}</View>}
      {before || data.next ? <View style={styles.paging}>
        {before ? <Action label="Previous page" icon="back" secondary onPress={() => setCursors((values) => values.slice(0, -1))} /> : null}
        <Text style={type.caption}>Page {cursors.length + 1}</Text>
        {data.next !== null ? <Action label="Next page" secondary onPress={() => {
          if (data.next !== null) setCursors([...cursors, data.next]);
        }} /> : null}
      </View> : null}
    </Phase> : null}
    {selectedTask ? <TaskDetails task={selectedTask} close={() => setSelected(null)}
      onChanged={(message) => { setSelected(null); setConfirmation(message); reload(); }} /> : null}
    {creating ? <Modal visible transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setCreating(false)}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={styles.taskTitle}>Create project task</Text>
          </View>
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <TaskAssignmentForm target={{ kind: 'project', id }} cancel={() => setCreating(false)} onDone={(taskId) => {
              setCreating(false);
              setInput('');
              setTerm('');
              setCursors([]);
              setConfirmation('Task T-' + taskId + ' created');
              reload();
            }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal> : null}
  </View>;
}

function TaskButton({ task, open, board = false }: { task: AssignedTask; open: (task: AssignedTask) => void; board?: boolean }) {
  return <Pressable accessibilityRole="button" testID={'project-task-' + task.id} onPress={() => open(task)}
    style={({ pressed }) => [board ? styles.card : styles.listRow, pressed && styles.pressed]}>
    <View style={styles.taskHeading}>
      <Text style={styles.taskId}>T-{task.id}</Text>
      <Text style={[styles.status, { color: lanes[laneIndex(task.status)].tint }]}>{task.status || 'No status'}</Text>
    </View>
    <Text style={styles.taskTitle}>{taskName(task)}</Text>
    {task.developer || task.due ? <Text style={type.caption}>{[task.developer, task.due ? 'Due ' + task.due : ''].filter(Boolean).join(' · ')}</Text> : null}
  </Pressable>;
}

function Board({ tasks, open }: { tasks: AssignedTask[]; open: (task: AssignedTask) => void }) {
  const groups = lanes.map((): AssignedTask[] => []);
  for (const task of tasks) groups[laneIndex(task.status)].push(task);
  return <ScrollView horizontal directionalLockEnabled keyboardShouldPersistTaps="handled"
    accessibilityLabel="Task status board" contentContainerStyle={styles.board}>
    {lanes.map((lane, index) => {
      const items = groups[index];
      if (lane.name === 'Other' && !items.length) return null;
      return <View key={lane.name} style={[styles.lane, { borderTopColor: lane.tint }]}>
        <View style={styles.laneHeader}>
          <Text accessibilityRole="header" style={styles.taskTitle}>{lane.name}</Text>
          <Text style={[styles.count, { color: lane.tint }]}>{items.length}</Text>
        </View>
        {items.length ? items.map((task) => <TaskButton key={task.id} task={task} open={open} board />)
          : <Text style={styles.laneEmpty}>No tasks</Text>}
      </View>;
    })}
  </ScrollView>;
}

function Timeline({ tasks, open }: { tasks: AssignedTask[]; open: (task: AssignedTask) => void }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) { progress.setValue(1); return; }
    const animation = Animated.timing(progress, {
      toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true, isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduced]);
  const schedule = taskSchedule(tasks);
  const days = schedule.last - schedule.first + 1;
  return <>
    {schedule.rows.length ? <View style={styles.chart}>
      <View style={styles.range}>
        <Text style={type.caption}>{scheduleLabel(schedule.first, true)}</Text>
        {days > 1 ? <Text style={type.caption}>{scheduleLabel(schedule.last, true)}</Text> : null}
      </View>
      {schedule.rows.map(({ task, first, last, start, due }, index) => {
        const offset = (first - schedule.first) * 100 / days;
        const width = (last - first + 1) * 100 / days;
        const subtitle = [
          start === null ? '' : 'Start ' + scheduleLabel(start, true),
          due === null ? '' : 'Due ' + scheduleLabel(due, true),
        ].filter(Boolean).join(' · ');
        return <Pressable key={task.id} accessibilityRole="button" testID={'timeline-task-' + task.id}
          onPress={() => open(task)} style={({ pressed }) => [styles.timelineRow, pressed && styles.pressed]}>
          <Text style={styles.taskTitle}>{taskName(task)}</Text>
          <Text style={type.caption}>{subtitle}</Text>
          <View style={styles.track} aria-hidden>
            <Animated.View style={[styles.bar, {
              start: `${offset}%`, width: `${width}%`, backgroundColor: lanes[laneIndex(task.status)].tint,
              transformOrigin: I18nManager.isRTL ? 'right center' : 'left center',
              transform: [{ scaleX: reduced ? 1 : progress.interpolate({
                inputRange: [Math.min(index, 7) * 0.06, 1], outputRange: [0, 1], extrapolate: 'clamp',
              }) }],
            }]} />
          </View>
        </Pressable>;
      })}
    </View> : null}
    {schedule.unscheduled.length ? <View style={styles.pane}>
      <Text accessibilityRole="header" style={styles.taskTitle}>Unscheduled</Text>
      <View style={styles.register}>{schedule.unscheduled.map((task) => <TaskButton key={task.id} task={task} open={open} />)}</View>
    </View> : null}
  </>;
}

function TaskDetails({ task, close, onChanged }: { task: AssignedTask; close: () => void; onChanged: (message: string) => void }) {
  const reduced = useReducedMotion();
  return <Modal transparent visible animationType={reduced ? 'none' : 'slide'} onRequestClose={close}>
    <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable aria-hidden onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetTitle}>
            <Text style={type.eyebrow}>T-{task.id}</Text>
            <Text accessibilityRole="header" style={styles.taskTitle}>{taskName(task)}</Text>
          </View>
          <TextAction label="Close" onPress={close} />
        </View>
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.pane} keyboardShouldPersistTaps="handled">
          {task.description ? <Text style={type.body}>{task.description}</Text> : null}
          {task.dateAccess ? <TaskDatePanel id={task.id}
            onChanged={(action) => onChanged(action === 'request' ? 'Date request sent' : 'Dates approved')} /> : null}
          {task.reassignable ? <TaskReassignment id={task.id} onDone={() => onChanged('Task reassigned')} /> : null}
          {task.workLog ? <TaskWorkLog id={task.id} onComplete={() => onChanged('Task T-' + task.id + ' completed')} /> : null}
          <DetailRecord rows={[
            ['Status', task.status], ['Assignee', task.developer], ['Assigned by', task.assigner], ['Team lead', task.lead],
            ...(task.reference ? [['SCM reference', task.reference]] as const : []),
            ...(task.function ? [['Function', task.function]] as const : []),
            ...(task.responsibility ? [['Responsibility', task.responsibility]] as const : []),
            ...(task.priority ? [['Priority', task.priority]] as const : []),
            ...(task.weight ? [['Weight', task.weight + '%']] as const : []),
            ...(task.dateAccess ? [] : [['Start date', task.start], ['Due date', task.due]] as const),
          ]} />
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  pane: { gap: 16 },
  empty: { minHeight: 96, padding: 16, justifyContent: 'center', borderWidth: 1, borderColor: color.edge, borderRadius: 12 },
  register: { borderWidth: 1, borderColor: color.edge, borderRadius: 12, backgroundColor: color.panel, overflow: 'hidden' },
  listRow: { paddingHorizontal: 14, paddingVertical: 12, minHeight: 76, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.edge },
  taskHeading: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  taskId: { color: color.subtle, fontFamily: 'monospace', fontSize: 12 },
  status: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  taskTitle: { color: color.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  pressed: { backgroundColor: '#263349' },
  paging: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  board: { gap: 12, paddingEnd: 3, paddingBottom: 12, alignItems: 'flex-start' },
  lane: { width: 238, padding: 10, gap: 8, backgroundColor: '#1B2534', borderRadius: 12, borderTopWidth: 3 },
  laneHeader: { minHeight: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, gap: 6 },
  count: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  laneEmpty: { color: color.subtle, padding: 12 },
  card: { padding: 12, gap: 6, minHeight: 78, borderRadius: 8, borderWidth: 1, borderColor: '#3A4658', backgroundColor: '#222D3D' },
  success: { color: color.success, fontSize: 16, fontWeight: '600' },
  chart: { paddingHorizontal: 14, backgroundColor: color.panel, borderWidth: 1, borderColor: color.edge, borderRadius: 12 },
  range: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingVertical: 12, columnGap: 12 },
  timelineRow: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: color.edge, paddingVertical: 12, gap: 5 },
  track: { height: 7, marginTop: 4, backgroundColor: color.raised, borderRadius: 4, overflow: 'hidden' },
  bar: { position: 'absolute', top: 0, bottom: 0, minWidth: 2, borderRadius: 4 },
  modal: { flex: 1, backgroundColor: '#080B10B8', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: color.panel,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 26, borderWidth: 1, borderColor: color.edge },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingBottom: 14 },
  sheetTitle: { flex: 1, gap: 4 },
  sheetScroll: { flexGrow: 0 },
});
