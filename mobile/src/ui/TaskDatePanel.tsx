import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { useSession } from '../scm/session';
import type { TaskDates } from '../scm/tasks-contract';
import { Field, FormMessage, Phase, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { color } from './theme';

const conflict = 'These dates have changed. Review the updated request before continuing.';

export function describeDateError(error: unknown) {
  const code = error instanceof AuthError ? error.code : null;
  if (code === 'date-range') return 'Enter a valid date range that changes the schedule.';
  if (code === 'date-reason-length') return 'Shorten the reason so it fits in SCM.';
  if (code === 'date-no-reviewer') return 'SCM has no eligible reviewer assigned to this task.';
  if (code === 'date-change-conflict') return conflict;
  if (code === 'not-found' || code === 'forbidden') return 'Your account can no longer change these dates.';
  return 'Couldn’t confirm the change. Check the task’s dates before trying again.';
}

export function TaskDatePanel({ id, onChanged }: { id: number; onChanged: (action: 'request' | 'approve') => void }) {
  const { state, expire } = useSession();
  const [editing, setEditing] = useState<'request' | 'approve' | null>(null);
  const reviewedRevision = useRef<string | null>(null);
  const [start, setStart] = useState('');
  const [due, setDue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.taskDates(grant, id, signal);
  }, [id]);
  const { result, reload } = useProtectedRead(read);

  function edit(dates: TaskDates, action: 'request' | 'approve') {
    setEditing(action);
    reviewedRevision.current = action === 'approve' ? dates.revision : null;
    setError('');
    if (action === 'request') {
      setStart(dates.start.slice(0, 10));
      setDue('');
      setReason('');
    }
  }

  async function submit(dates: TaskDates, action: 'request' | 'approve') {
    if (state.kind !== 'active' || !authClient || pending.current) return;
    const reviseStart = dates.requestMode === 'schedule' && start.trim() !== dates.start && start.trim() !== '';
    if (action === 'request' && (!due.trim() || (reviseStart && !reason.trim()))) {
      setError(due.trim() ? 'Enter a reason for revising the start date.' : 'Enter the proposed due date.');
      return;
    }
    const revision = reviewedRevision.current;
    if (action === 'approve' && (!revision || revision !== dates.revision || !dates.canApprove)) {
      setEditing(null);
      setError(conflict);
      return;
    }
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    const { grant } = state;
    try {
      if (action === 'request') {
        await authClient.requestTaskDates(grant, id, { start: reviseStart ? start.trim() : undefined, due: due.trim(), reason: reason.trim() }, request.signal);
      } else if (revision) {
        await authClient.approveTaskDates(grant, id, revision, request.signal);
      }
      if (!request.signal.aborted) {
        setEditing(null);
        reload();
        onChanged(action);
      }
    } catch (failure) {
      if (request.signal.aborted) return;
      const code = failure instanceof AuthError ? failure.code : null;
      if (code === 'expired') expire(grant.sessionToken);
      else {
        setError(describeDateError(failure));
        if (code === 'date-change-conflict' || code === 'not-found' || code === 'forbidden') {
          setEditing(null);
          reload();
        }
      }
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <View style={styles.panel}>
    <Text style={styles.title} accessibilityRole="header">Task dates</Text>
    {error ? <FormMessage message={error} /> : null}
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading dates…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={result.code === 'not-found' || result.code === 'forbidden'
        ? 'These dates are unavailable to your account.' : 'Couldn’t load task dates.'} />
      {result.code !== 'not-found' && result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
    </> : null}
    {result.kind === 'ready' ? <>
      <DateComparison current={result.data} proposed={result.data.revision
        ? { start: result.data.requestedStart || result.data.start, due: result.data.requestedDue } : undefined} />
      {result.data.approval ? <Text style={[type.eyebrow, result.data.approval === 'Date Approved' && styles.approved]}>{result.data.approval}</Text> : null}
      {result.data.reason ? <Text style={type.body}>{result.data.reason}</Text> : null}
      {!editing && result.data.requestMode !== 'none'
        ? <TextAction label="Request date change" testID="open-date-request" onPress={() => edit(result.data, 'request')} /> : null}
      {!editing && result.data.canApprove
        ? <TextAction label="Review request" testID="open-date-approval" onPress={() => edit(result.data, 'approve')} /> : null}
      {editing ? <Phase key={editing} shift={12}><View style={styles.editor}>
        {editing === 'request' ? <DateProposalFields start={result.data.requestMode === 'schedule' ? start : undefined}
          due={due} reason={reason} onStart={setStart} onDue={setDue} onReason={setReason} busy={busy} /> : <>
          <Text style={styles.title}>Apply these dates?</Text>
          <Text style={type.body}>SCM will update the task schedule and record your approval in its history.</Text>
        </>}
        <Action label={busy ? 'Saving…' : editing === 'request' ? 'Send request' : 'Approve dates'} icon="check"
          busy={busy} testID="date-submit" onPress={() => void submit(result.data, editing)} />
        <TextAction label="Cancel" disabled={busy} onPress={() => { Keyboard.dismiss(); setEditing(null); setError(''); }} />
      </View></Phase> : null}
      {result.data.history.length ? <View style={styles.history}>
        <Text accessibilityRole="header" style={styles.title}>Approval history</Text>
        {result.data.history.map((entry) => <View key={entry.id} style={styles.entry}>
          <Text style={type.eyebrow}>{[entry.approvedAt, entry.by].filter(Boolean).join(' · ')}</Text>
          <Text style={type.body}>{'Due ' + (entry.due || 'unset') + ' → ' + (entry.revisedDue || 'unset')}</Text>
          {entry.start !== entry.revisedStart
            ? <Text style={type.caption}>{'Start ' + (entry.start || 'unset') + ' → ' + (entry.revisedStart || 'unset')}</Text> : null}
          {entry.reason ? <Text style={type.caption}>{entry.reason}</Text> : null}
        </View>)}
        {result.data.hasMore ? <Text style={type.caption}>Showing the 20 latest approvals</Text> : null}
      </View> : null}
    </> : null}
  </View>;
}

export function DateProposalFields({ start, due, reason, onStart, onDue, onReason, busy = false, requireReason = false }: {
  start?: string; due: string; reason: string; onStart: (value: string) => void;
  onDue: (value: string) => void; onReason: (value: string) => void; busy?: boolean; requireReason?: boolean;
}) {
  return <>
    {start !== undefined ? <Field label="Proposed start date" placeholder="DD.MM.YYYY" value={start}
      onChangeText={onStart} maxLength={10} editable={!busy} testID="date-request-start" /> : null}
    <Field label="Proposed due date" placeholder="DD.MM.YYYY" value={due} onChangeText={onDue}
      maxLength={10} editable={!busy} testID="date-request-due" />
    <Field label="Reason" placeholder={requireReason ? 'Required' : start !== undefined ? 'Required if the start date changes' : 'Optional'}
      value={reason} onChangeText={onReason} multiline autoCapitalize="sentences" maxLength={255} editable={!busy}
      testID="date-request-reason" style={styles.reason} />
  </>;
}

export function DateComparison({ current, proposed }: {
  current: { start: string; due: string }; proposed?: { start: string; due: string };
}) {
  return <View style={styles.dates}>
    <Dates label="Current dates" start={current.start} due={current.due} />
    {proposed ? <Dates label="Proposed dates" start={proposed.start} due={proposed.due} proposed /> : null}
  </View>;
}

function Dates({ label, start, due, proposed = false }: { label: string; start: string; due: string; proposed?: boolean }) {
  return <View style={[styles.summary, proposed && styles.proposed]}>
    <View style={styles.line}>
      <Icon name={proposed ? 'arrow' : 'work'} size={14} tint={proposed ? color.blue : color.subtle} />
      <Text style={proposed ? type.eyebrow : type.caption}>{label}</Text>
    </View>
    <Text style={styles.value}>Start {start || 'unset'}</Text>
    <Text style={styles.value}>Due {due || 'unset'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  title: { color: color.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { flexGrow: 1, flexBasis: 128, borderRadius: 8, borderWidth: 1, borderColor: color.edge, padding: 12, gap: 4, backgroundColor: color.base },
  proposed: { borderColor: '#435A7A', backgroundColor: '#1D293B' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  value: { color: color.text, fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  approved: { color: color.success },
  editor: { gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: color.edge, backgroundColor: color.base },
  reason: { minHeight: 68, textAlignVertical: 'top' },
  history: { gap: 12, marginTop: 4 },
  entry: { gap: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.edge },
});
