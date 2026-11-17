import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, submissionKey, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { useSession } from '../scm/session';
import type { StandaloneTask, TaskAssignee, TaskTransfer } from '../scm/tasks-contract';
import { AccessRail, Field, FormMessage, Phase, SearchField, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { WorkspaceTabs } from './Workspace';
import { color } from './theme';

const priorities = ['Low', 'Normal', 'High', 'Immediate'] as const;
const steps = ['Assignee', 'Details', 'Schedule'];

function message(error: unknown) {
  const code = error instanceof AuthError ? error.code : null;
  if (code === 'invalid-task-draft') return 'Check the task details, date order, and weight.';
  if (code === 'task-weight-limit') return 'This weight would take the customer, product, and function total above 100%.';
  if (code === 'candidate-unavailable') return 'This person is no longer eligible. Choose another assignee.';
  if (code === 'task-assignment-conflict') return 'This task or draft has changed. Review the latest assignment before saving.';
  if (code === 'not-found' || code === 'forbidden') return 'Your account can no longer change this assignment.';
  return 'Couldn’t confirm the assignment. Retry to check whether it was saved.';
}

export type PreparedAssignment = TaskTransfer & { person: string };

type Target = { kind: 'project'; id: number } | { kind: 'standalone'; scope: StandaloneTask }
  | { kind: 'reassign'; id: number; stage?: (item: PreparedAssignment) => void };

export function TaskAssignmentForm({ target, onDone, cancel, cancelLabel = 'Cancel', progress }: {
  target: Target; onDone?: (taskId: number) => void; cancel: () => void; cancelLabel?: string;
  progress?: { labels: readonly string[]; offset: number };
}) {
  const create = target.kind !== 'reassign';
  const scope = target.kind === 'standalone' ? target.scope : null;
  const id = target.kind === 'standalone' ? 0 : target.id;
  const { state, expire } = useSession();
  const [requestKey] = useState(submissionKey);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selection, setSelection] = useState<{ person: TaskAssignee; revision: string | null } | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({ module: '', description: '', start: '', due: '', weight: '', priority: 1 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return scope ? authClient.standaloneAssignees(grant, scope.context, term || undefined, signal)
      : authClient.assignees(grant, id, create, term || undefined, signal);
  }, [create, id, scope, term]);
  const { result, reload } = useProtectedRead(read);

  function search(value: string) {
    Keyboard.dismiss();
    setTerm(value.trim());
    setSelection(null);
    setError('');
  }

  async function submit() {
    if (!authClient || state.kind !== 'active' || !selection || pending.current) return;
    if (create && (!draft.module.trim() || !draft.description.trim() || !draft.start.trim() || !draft.due.trim() || !draft.weight.trim())) {
      setError('Complete the title, description, dates, and weight.');
      return;
    }
    if (!create && !selection.revision) return;
    if (target.kind === 'reassign' && target.stage && selection.revision) {
      target.stage({ id, revision: selection.revision, candidate: selection.person.key, person: selection.person.name });
      return;
    }
    const { grant } = state;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      let taskId = id;
      if (create) {
        taskId = await authClient.createTask(grant, scope ?? id, { ...draft, priority: priorities[draft.priority],
          candidate: selection.person.key, requestKey }, request.signal);
      } else if (selection.revision) {
        await authClient.reassignTask(grant, id, selection.revision, selection.person.key, request.signal);
      }
      if (!request.signal.aborted) onDone?.(taskId);
    } catch (failure) {
      if (request.signal.aborted) return;
      const code = failure instanceof AuthError ? failure.code : null;
      if (code === 'expired') expire(grant.sessionToken);
      else {
        setError(message(failure));
        if (code === 'candidate-unavailable' || code === 'task-assignment-conflict') {
          setSelection(null);
          setStep(0);
          reload();
        }
      }
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <View style={styles.content}>
    {create ? <AccessRail labels={progress?.labels ?? steps} index={step + (progress?.offset ?? 0)} /> : null}
    {error ? <FormMessage message={error} /> : null}
    {step !== 0 && selection ? <Phase key={step} shift={14}>
      <View style={styles.selected}>
        <Icon name="profile" size={20} tint={color.blue} />
        <View style={styles.copy}>
          <Text style={type.caption}>Assignee</Text>
          <Text style={styles.name}>{selection.person.name}</Text>
          {selection.person.lead ? <Text style={type.caption}>Team lead · {selection.person.lead}</Text> : null}
        </View>
        <TextAction label="Change" disabled={busy} onPress={() => { setStep(0); setError(''); }} />
      </View>
      {create ? <View style={styles.fields}>
        {step === 1 ? <>
          <Field label="Task title" value={draft.module} maxLength={120} editable={!busy}
            autoCapitalize="sentences" testID="assignment-title" onChangeText={(module) => setDraft({ ...draft, module })} />
          <Field label="Description" value={draft.description} maxLength={255} editable={!busy}
            autoCapitalize="sentences" multiline style={styles.description} testID="assignment-description"
            onChangeText={(description) => setDraft({ ...draft, description })} />
          <Text style={styles.label}>Priority</Text>
          <WorkspaceTabs labels={priorities} index={draft.priority} onSelect={(priority) => {
            if (!busy) setDraft({ ...draft, priority });
          }} />
        </> : <>
          <Field label="Start date" placeholder="DD.MM.YYYY" value={draft.start} maxLength={10}
            editable={!busy} testID="assignment-start" onChangeText={(start) => setDraft({ ...draft, start })} />
          <Field label="Due date" placeholder="DD.MM.YYYY" value={draft.due} maxLength={10}
            editable={!busy} testID="assignment-due" onChangeText={(due) => setDraft({ ...draft, due })} />
          <Field label="Weight (%)" placeholder="0–100" value={draft.weight} maxLength={6} editable={!busy}
            keyboardType="decimal-pad" testID="assignment-weight" onChangeText={(weight) => setDraft({ ...draft, weight })} />
        </>}
      </View> : <Text style={type.body}>Assign task T-{id} to {selection.person.name}?</Text>}
      {create && step === 1 ? <Action label="Continue to schedule" testID="assignment-schedule" onPress={() => {
        Keyboard.dismiss();
        if (!draft.module.trim() || !draft.description.trim()) setError('Enter the task title and description.');
        else { setError(''); setStep(2); }
      }} /> : <Action label={busy ? 'Saving…' : create ? 'Create task'
        : target.kind === 'reassign' && target.stage ? 'Add to batch' : 'Confirm reassignment'} icon="check"
        onPress={() => void submit()} busy={busy} testID="assignment-submit" />}
      {create && step === 2 ? <TextAction label="Back to details" disabled={busy} onPress={() => {
        Keyboard.dismiss(); setError(''); setStep(1);
      }} /> : null}
    </Phase> : <Phase shift={-8}>
      <SearchField label="Search eligible assignees" placeholder="Name" value={query} onChange={setQuery}
        onSubmit={() => search(query)} onClear={query || term ? () => { setQuery(''); search(''); } : undefined} testID="assignment-search" />
      {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading eligible assignees…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={message(result.code ? new AuthError(result.code) : null)} />
        <TextAction label="Try again" onPress={reload} />
      </> : null}
      {result.kind === 'ready' ? <>
        {result.data.items.length ? <View style={styles.people}>
          {result.data.items.map((person) => <Pressable key={person.key} accessibilityRole="button"
            accessibilityState={{ selected: selection?.person.key === person.key }}
            onPress={() => { setSelection({ person, revision: result.data.revision }); setError(''); }} testID={'assignee-' + person.name}
            style={({ pressed }) => [styles.person, selection?.person.key === person.key && styles.active, pressed && styles.pressed]}>
            <View style={styles.copy}>
              <Text style={styles.name}>{person.name}</Text>
              <Text style={type.caption}>{[person.role, person.lead && 'Team lead ' + person.lead, person.manager && 'Manager ' + person.manager]
                .filter(Boolean).join(' · ')}</Text>
            </View>
            {selection?.person.key === person.key ? <Icon name="check" tint={color.blue} /> : null}
          </Pressable>)}
        </View> : <Text style={type.body}>{term ? 'No eligible assignees match your search.' : 'SCM has no eligible assignees for this work.'}</Text>}
        {result.data.hasMore ? <Text style={type.caption}>Search by name to see more people</Text> : null}
        {selection ? <Action label={create ? 'Continue' : 'Review reassignment'} onPress={() => { setError(''); setStep(1); }} testID="assignment-continue" /> : null}
      </> : null}
    </Phase>}
    <TextAction label={cancelLabel} disabled={busy} onPress={cancel} />
  </View>;
}

export function TaskReassignment({ id, onDone }: { id: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return open ? <Phase shift={14}>
    <Text accessibilityRole="header" style={styles.name}>Reassign task</Text>
    <TaskAssignmentForm target={{ kind: 'reassign', id }} cancel={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />
  </Phase> : <TextAction label="Reassign task" testID="open-reassign" onPress={() => setOpen(true)} />;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  fields: { gap: 12 },
  people: { borderRadius: 8, borderWidth: 1, borderColor: color.edge, overflow: 'hidden' },
  selected: { minHeight: 68, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, backgroundColor: '#1D293B' },
  person: { minHeight: 64, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  active: { backgroundColor: '#24344B' },
  pressed: { opacity: 0.78 },
  copy: { flex: 1, gap: 4 },
  name: { color: color.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  label: { color: color.text, fontSize: 14, fontWeight: '500' },
  description: { minHeight: 72, textAlignVertical: 'top' },
});
