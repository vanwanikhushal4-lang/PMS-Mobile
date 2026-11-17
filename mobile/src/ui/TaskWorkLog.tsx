import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { useSession } from '../scm/session';
import { Field, FormMessage, Phase, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { color } from './theme';

const noteLimit = 255;

export function TaskWorkLog({ id, onComplete }: { id: number; onComplete: () => void }) {
  const { state, expire } = useSession();
  const [mode, setMode] = useState<'progress' | 'complete' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.workLog(grant, id, signal);
  }, [id]);
  const { result, lastReady, reload } = useProtectedRead(read);
  const denied = result.kind === 'error' && (result.code === 'not-found' || result.code === 'forbidden');
  const log = result.kind === 'ready' ? result.data : denied ? null : lastReady;
  const canEdit = result.kind === 'ready' && !result.data.completed;

  function select(next: typeof mode) {
    Keyboard.dismiss();
    setMode(next);
    setError('');
  }

  async function submit() {
    if (!authClient || state.kind !== 'active' || !mode || pending.current) return;
    const text = note.trim();
    if (mode === 'progress' && !text) {
      setError('Enter a progress note.');
      return;
    }
    Keyboard.dismiss();
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    setSaved(false);
    const { grant } = state;
    try {
      if (mode === 'complete') await authClient.completeTask(grant, id, request.signal);
      else await authClient.logProgress(grant, id, text, request.signal);
      if (request.signal.aborted) return;
      if (mode === 'complete') {
        onComplete();
      } else {
        setNote('');
        setMode(null);
        setSaved(true);
        reload();
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      const code = failure instanceof AuthError ? failure.code : null;
      if (code === 'expired') {
        expire(grant.sessionToken);
      } else if (code === 'progress-already-logged' || code === 'task-closed' || code === 'not-found') {
        setMode(null);
        setError(code === 'progress-already-logged' ? 'Today’s progress is already logged.'
          : code === 'task-closed' ? 'This task is already complete.' : 'This task is no longer available to your account.');
        reload();
      } else {
        setError('Couldn’t confirm the update. Try again.');
      }
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <View style={styles.log}>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>Work log</Text>
      {log && !log.completed ? <Text style={type.caption}>{log.date}</Text> : null}
    </View>
    {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading work log…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={denied ? 'This work log is unavailable.' : 'Couldn’t load this work log.'} />
      {!denied ? <TextAction label="Try again" onPress={reload} /> : null}
    </> : null}
    {saved ? <Phase><View style={styles.confirmed}>
      <Icon name="check" tint={color.success} />
      <Text accessibilityLiveRegion="polite" style={styles.success}>Progress saved</Text>
    </View></Phase> : null}
    {error ? <FormMessage message={error} /> : null}
    {canEdit && !mode ? <View style={styles.actions}>
      {log?.loggedToday && !saved ? <Text style={type.caption}>Today’s progress is logged</Text> : null}
      {!log?.loggedToday ? <TextAction label="Add progress" onPress={() => select('progress')} testID="task-add-progress" /> : null}
      <TextAction label="Mark complete" onPress={() => select('complete')} testID="task-mark-complete" />
    </View> : null}
    {canEdit && mode ? <Phase key={mode} shift={12}><View style={styles.editor}>
      {mode === 'progress' ? <>
        <Field label="Progress note" testID="task-progress-note" value={note} onChangeText={setNote}
          maxLength={noteLimit} multiline autoCapitalize="sentences" editable={!busy}
          placeholder="What did you work on today?" style={styles.note} />
        <Text style={styles.counter}>{note.length} / {noteLimit}</Text>
      </> : <>
        <Text style={styles.title}>Complete task T-{id}?</Text>
        <Text style={type.body}>The task moves to Completed and SCM records the change in its work log.</Text>
      </>}
      <Action label={busy ? 'Saving…' : mode === 'progress' ? 'Save progress' : 'Complete task'}
        icon="check" busy={busy} onPress={() => void submit()} testID="task-work-log-submit" />
      <TextAction label="Cancel" disabled={busy} onPress={() => select(null)} />
    </View></Phase> : null}
    {log && (log.items.length ? <View style={styles.history}>
      {log.items.map((entry) => <View key={entry.id} style={styles.entry}>
        <Text style={type.eyebrow}>{[entry.date || 'Date unavailable', entry.status].filter(Boolean).join(' · ')}</Text>
        {entry.note ? <Text style={type.body}>{entry.note}</Text> : null}
        {entry.author ? <Text style={type.caption}>{entry.author}</Text> : null}
      </View>)}
      {log.hasMore ? <Text style={type.caption}>Showing the 20 latest entries.</Text> : null}
    </View> : <Text style={type.caption}>No work-log entries yet</Text>)}
  </View>;
}

const styles = StyleSheet.create({
  log: { gap: 12, marginTop: 4 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: color.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  history: { gap: 12 },
  entry: { gap: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, alignItems: 'center' },
  editor: { gap: 8, padding: 12, borderWidth: 1, borderColor: color.edge, borderRadius: 12, backgroundColor: color.base },
  note: { minHeight: 100, textAlignVertical: 'top' },
  counter: { color: color.subtle, fontSize: 12, fontVariant: ['tabular-nums'], textAlign: 'right' },
  confirmed: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  success: { color: color.success, fontWeight: '600' },
});
