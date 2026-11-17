import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthError } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useSession } from '../scm/session';
import type { AssignedTask } from '../scm/tasks-contract';
import { FormMessage, Phase, TextAction } from './Access';
import { Action, type } from './Primitives';
import { TaskAssignmentForm, type PreparedAssignment } from './TaskAssignmentForm';
import { color } from './theme';

export function BulkTaskAssignments({ items, cancel, onDone, onStale }: {
  items: readonly AssignedTask[]; cancel: () => void; onDone: (count: number) => void; onStale: () => void;
}) {
  const { state, expire } = useSession();
  const [changes, setChanges] = useState<PreparedAssignment[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function stage(item: PreparedAssignment) {
    setChanges((current) => [...current.filter(({ id }) => id !== item.id), item]);
    setOpen(null);
    setError('');
  }

  async function submit() {
    if (!authClient || state.kind !== 'active' || changes.length < 2 || pending.current) return;
    const { grant } = state;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setOpen(null);
    setError('');
    try {
      await authClient.reassignTasks(grant, changes.map(({ id, revision, candidate }) => ({ id, revision, candidate })), request.signal);
      if (!request.signal.aborted) onDone(changes.length);
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure instanceof AuthError && failure.code === 'expired') expire(grant.sessionToken);
      else if (failure instanceof AuthError && failure.taskId && changes.some(({ id }) => id === failure.taskId)) {
        setChanges((current) => current.filter(({ id }) => id !== failure.taskId));
        setError('The batch was rolled back. Check task T-' + failure.taskId + ' before saving again.');
        onStale();
      } else {
        setError('Couldn’t confirm the batch. Review the current assignees in Team before retrying.');
        onStale();
      }
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <Phase shift={16}>
    <Text accessibilityRole="header" style={styles.heading}>Reassign several tasks</Text>
    <Text style={type.body}>Choose a new assignee for each task, then save the batch.</Text>
    {error ? <FormMessage message={error} /> : null}
    <View style={styles.panel}>
      <Text accessibilityLiveRegion="polite" style={styles.heading}>{changes.length} ready to reassign</Text>
      {changes.map((item) => <View key={item.id} style={styles.staged}>
        <Text style={[type.body, styles.copy]}>T-{item.id} → {item.person}</Text>
        <TextAction label={'Remove T-' + item.id} disabled={busy} onPress={() => setChanges(changes.filter(({ id }) => id !== item.id))} />
      </View>)}
      {changes.length >= 2 ? <Action label={busy ? 'Saving…' : 'Reassign ' + changes.length + ' tasks'} icon="check"
        busy={busy} onPress={() => void submit()} testID="bulk-reassign-submit" /> : <Text style={type.caption}>Choose at least two tasks.</Text>}
      {changes.length === 30 ? <Text style={type.caption}>This batch has reached the 30 task limit.</Text> : null}
    </View>
    {items.filter((item) => item.reassignable).map((item) => {
      const staged = changes.find(({ id }) => id === item.id);
      return <View key={item.id} style={styles.panel}>
        <Text style={type.eyebrow}>T-{item.id}</Text>
        <Text style={styles.heading}>{item.module || 'Unnamed task'}</Text>
        <Text style={type.caption}>{[item.customer, item.developer].filter(Boolean).join(' · ')}</Text>
        {open === item.id ? <Phase shift={12}>
          <TaskAssignmentForm target={{ kind: 'reassign', id: item.id, stage }} cancel={() => setOpen(null)} />
        </Phase> : <TextAction label={staged ? 'Change new assignee' : 'Choose new assignee'}
          accessibilityLabel={(staged ? 'Change' : 'Choose') + ' new assignee for T-' + item.id}
          disabled={busy || (!staged && changes.length === 30)} onPress={() => setOpen(item.id)} />}
      </View>;
    })}
    <TextAction label="Exit bulk reassignment" disabled={busy} onPress={cancel} />
  </Phase>;
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  heading: { color: color.text, fontSize: 17, fontWeight: '600' },
  staged: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flex: 1 },
});
