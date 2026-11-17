import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { useSession } from '../scm/session';
import type { AssignedTask, DateProposal, TaskDates } from '../scm/tasks-contract';
import { AccessRail, FormMessage, Phase, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { DateComparison, DateProposalFields, describeDateError } from './TaskDatePanel';
import { color } from './theme';

const steps = ['Select tasks', 'Review'];
const limit = 20;
type Selection = { task: AssignedTask; proposal: DateProposal };

export function BulkTaskDates({ approve, items, cancel, onSaved, onStale }: {
  approve: boolean; items: readonly AssignedTask[]; cancel: () => void; onSaved: (count: number) => void; onStale: () => void;
}) {
  const { state, expire } = useSession();
  const [selected, setSelected] = useState<Selection[]>([]);
  const [editing, setEditing] = useState<AssignedTask | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  function saveSelection(selection: Selection) {
    const id = selection.task.id;
    setSelected((previous) => [...previous.filter(({ task }) => task.id !== id), selection]);
    setEditing(null);
    setError('');
  }

  function remove(id: number) {
    setSelected((previous) => previous.filter(({ task }) => task.id !== id));
  }

  async function submit() {
    if (!authClient || state.kind !== 'active' || request.current || selected.length < 2) return;
    const { grant } = state;
    const pending = new AbortController();
    request.current = pending;
    setBusy(true);
    setError('');
    try {
      if (approve) {
        await authClient.approveTaskDatesBatch(grant, selected.map(({ proposal: { id, revision } }) => ({ id, revision })), pending.signal);
      } else {
        await authClient.requestTaskDatesBatch(grant, selected.map(({ proposal }) => proposal), pending.signal);
      }
      if (!pending.signal.aborted) onSaved(selected.length);
    } catch (failure) {
      if (pending.signal.aborted) return;
      if (failure instanceof AuthError && failure.code === 'expired') {
        expire(grant.sessionToken);
      } else if (failure instanceof AuthError && failure.taskId && selected.some(({ task }) => task.id === failure.taskId)) {
        const taskId = failure.taskId;
        const stale = failure.code === 'date-change-conflict' || failure.code === 'not-found';
        if (stale || approve) remove(taskId);
        setReview(false);
        setError('No dates were saved. T-' + taskId + ' · ' + describeDateError(failure));
        if (stale || approve) onStale();
        else setEditing(selected.find(({ task }) => task.id === taskId)?.task ?? null);
      } else {
        setError('Couldn’t confirm the batch. Check the queue before trying again.');
        setReview(false);
        setSelected([]);
        onStale();
      }
    } finally {
      request.current = null;
      if (!pending.signal.aborted) setBusy(false);
    }
  }

  const visible = approve ? items.filter((task) => task.dateReview?.canApprove) : items;
  return <Phase shift={16}>
    <AccessRail labels={steps} index={review ? 1 : 0} />
    {error ? <FormMessage message={error} /> : null}
    {review ? <Phase key="review" shift={20}>
      <Text accessibilityRole="header" style={styles.title}>{approve ? 'Review approvals' : 'Review date requests'}</Text>
      {selected.map(({ task, proposal }) => <View key={task.id} style={styles.card}>
        <TaskLabel task={task} />
        <DateComparison current={task} proposed={proposal} />
        {proposal.reason ? <Text style={type.body}>{proposal.reason}</Text> : null}
      </View>)}
      <Action label={busy ? 'Saving…' : (approve ? 'Approve ' : 'Send ') + selected.length + ' requests'} busy={busy}
        icon="check" testID="date-batch-submit" onPress={() => void submit()} />
      <TextAction label="Back to selection" disabled={busy} onPress={() => setReview(false)} />
    </Phase> : <Phase key="selection" shift={-12}>
      <View style={styles.card}>
        <Text style={styles.title} accessibilityLiveRegion="polite">{selected.length} selected</Text>
        {selected.map(({ task }) => <View key={task.id} style={styles.line}>
          <Text style={[type.body, styles.copy]} numberOfLines={2}>T-{task.id} · {task.module || 'Task ' + task.id}</Text>
          <TextAction label={'Remove T-' + task.id} onPress={() => remove(task.id)} />
        </View>)}
        {selected.length >= 2 ? <Action label={approve ? 'Review selected approvals' : 'Review date requests'}
          testID="date-batch-review" onPress={() => { setEditing(null); setError(''); setReview(true); }} />
          : <Text style={type.caption}>Select at least two tasks.</Text>}
        {selected.length === limit ? <Text style={type.caption}>This batch has reached the 20 task limit.</Text> : null}
      </View>
      {visible.map((listedTask) => {
        const existing = selected.find(({ task }) => task.id === listedTask.id);
        const proposed = listedTask.dateReview;
        const atLimit = !existing && selected.length >= limit;
        return <View key={listedTask.id} style={[styles.card, existing && styles.selected]}>
          <TaskLabel task={listedTask} />
          {approve && proposed ? <>
            <DateComparison current={listedTask} proposed={proposed} />
            {proposed.reason ? <Text style={type.body}>{proposed.reason}</Text> : null}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!existing, disabled: atLimit }}
              accessibilityLabel={'Select approval for T-' + listedTask.id} disabled={atLimit} testID={'date-batch-select-' + listedTask.id}
              style={({ pressed }) => [styles.check, pressed && styles.pressed]}
              onPress={() => existing ? remove(listedTask.id)
                : saveSelection({ task: listedTask, proposal: { id: listedTask.id, ...proposed } })}>
              <View style={[styles.box, existing && styles.selected]}>{existing ? <Icon name="check" size={14} tint={color.blue} /> : null}</View>
              <Text style={type.body}>{existing ? 'Selected' : 'Select for approval'}</Text>
            </Pressable>
          </> : editing?.id === listedTask.id ? <ProposalEditor task={listedTask} previous={existing?.proposal}
            onSave={saveSelection} cancel={() => setEditing(null)} /> : <>
            <DateComparison current={listedTask} proposed={existing?.proposal} />
            <TextAction label={existing ? 'Edit proposal' : 'Propose dates'} disabled={atLimit}
              accessibilityLabel={(existing ? 'Edit proposal for T-' : 'Propose dates for T-') + listedTask.id}
              testID={'date-batch-edit-' + listedTask.id} onPress={() => setEditing(listedTask)} />
          </>}
        </View>;
      })}
      {editing && !items.some((item) => item.id === editing.id) ? <View style={styles.card}>
        <TaskLabel task={editing} />
        <ProposalEditor task={editing} previous={selected.find(({ task }) => task.id === editing.id)?.proposal}
          onSave={saveSelection} cancel={() => setEditing(null)} />
      </View> : null}
      <TextAction label={approve ? 'Exit batch approval' : 'Exit batch date changes'} onPress={cancel} />
    </Phase>}
  </Phase>;
}

function TaskLabel({ task }: { task: AssignedTask }) {
  return <>
    <Text style={type.eyebrow}>T-{task.id}</Text>
    <Text accessibilityRole="header" style={styles.title}>{task.module || 'Task ' + task.id}</Text>
    {task.developer ? <Text style={type.caption}>{task.developer}</Text> : null}
  </>;
}

function ProposalEditor({ task, previous, cancel, onSave }: {
  task: AssignedTask; previous?: DateProposal; cancel: () => void; onSave: (item: Selection) => void;
}) {
  const [error, setError] = useState('');
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.taskDates(grant, task.id, signal) : Promise.reject(new AuthError('unavailable')), [task.id]);
  const { result, reload } = useProtectedRead(read);
  return <Phase shift={14}>
    {error ? <FormMessage message={error} /> : null}
    {result.kind === 'loading' ? <Text style={type.caption}>Loading current dates…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={describeDateError(result.code ? new AuthError(result.code) : null)} />
      <TextAction label="Try again" onPress={reload} />
    </> : null}
    {result.kind === 'ready' && (result.data.requestMode !== 'schedule' || !result.data.scheduleRevision)
      ? <FormMessage message="This task is no longer available for a team schedule change." /> : null}
    {result.kind === 'ready' && result.data.requestMode === 'schedule' && result.data.scheduleRevision
      ? <ProposalInputs key={result.data.scheduleRevision} task={task} dates={result.data} previous={previous} setError={setError} onSave={onSave} /> : null}
    <TextAction label="Cancel proposal" onPress={() => { Keyboard.dismiss(); cancel(); }} />
  </Phase>;
}

function ProposalInputs({ task, dates, previous, setError, onSave }: {
  task: AssignedTask; dates: TaskDates; previous?: DateProposal; setError: (value: string) => void; onSave: (item: Selection) => void;
}) {
  const matches = previous?.revision === dates.scheduleRevision;
  const [start, setStart] = useState(matches ? previous.start : dates.start.slice(0, 10));
  const [due, setDue] = useState(matches ? previous.due : dates.due.slice(0, 10));
  const [reason, setReason] = useState(matches ? previous.reason : '');
  return <>
    <DateComparison current={dates} />
    <DateProposalFields start={start} due={due} reason={reason} onStart={setStart} onDue={setDue}
      onReason={setReason} requireReason />
    <Action label="Add to date batch" testID="date-batch-add" onPress={() => {
      Keyboard.dismiss();
      if (!dates.scheduleRevision || !start.trim() || !due.trim() || !reason.trim()) {
        setError('Enter a start date, due date, and reason.');
        return;
      }
      onSave({ task: { ...task, start: dates.start, due: dates.due },
        proposal: { id: task.id, revision: dates.scheduleRevision, start: start.trim(), due: due.trim(), reason: reason.trim() } });
    }} />
  </>;
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 8, backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1, borderRadius: 8 },
  title: { color: color.text, fontSize: 17, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flex: 1 },
  selected: { backgroundColor: color.raised, borderColor: color.blue },
  check: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  box: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4, borderWidth: 1, borderColor: color.edge },
  pressed: { opacity: 0.75 },
});
