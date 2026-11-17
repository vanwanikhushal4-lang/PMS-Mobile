import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openAttachment } from '../scm/attachment-transfer';
import type { Attachment, AttachmentKind, AttachmentTarget } from '../scm/attachments-contract';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import { useSession } from '../scm/session';
import { FormMessage, Phase, TextAction } from './Access';
import { Icon, type } from './Primitives';
import { color } from './theme';

const titles: Record<AttachmentKind, string> = {
  'masked-po': 'Masked purchase order',
  'product-features': 'Product feature list',
  'requirement-file': 'Requirement document',
  'understanding-file': 'Understanding document',
  'other-understanding': 'Additional understanding file',
  'scope-of-work': 'Scope of work',
  rfp: 'Request for proposal',
  other: 'Other supporting file',
};

export function ProjectAttachmentPanel({ target }: { target: AttachmentTarget }) {
  const { state, expire } = useSession();
  const { scope, id } = target;
  const recordId = 'recordId' in target ? target.recordId : 0;
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.projectAttachments(grant, scope === 'purchase-order' ? { scope, id } : { scope, id, recordId }, signal)
    : Promise.reject(new AuthError('unavailable')), [scope, id, recordId]);
  const { result, reload } = useProtectedRead(read);
  const [activity, setActivity] = useState<{ kind: AttachmentKind; percent: number | null; opening: boolean } | null>(null);
  const [error, setError] = useState('');
  const live = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; pending.current?.abort(); };
  }, []);

  async function open(asset: Attachment) {
    if (state.kind !== 'active' || pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setError('');
    setActivity({ kind: asset.kind, percent: null, opening: false });
    const { grant } = state;
    try {
      await openAttachment(target, asset, grant, request.signal,
        (percent) => { if (!request.signal.aborted) setActivity({ kind: asset.kind, percent, opening: false }); },
        () => { if (!request.signal.aborted) setActivity({ kind: asset.kind, percent: null, opening: true }); });
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure instanceof AuthError && failure.code === 'expired') expire(grant.sessionToken);
      else if (failure instanceof AuthError && failure.code === 'not-found') setError('SCM couldn’t find the stored file.');
      else if (failure instanceof AuthError && failure.code === 'forbidden') setError('This file is unavailable to your account.');
      else if (failure instanceof AuthError && failure.code === 'bad-response') {
        setError('The file changed or the transfer was incomplete. Try opening it again.');
        reload();
      } else setError('Couldn’t open the file. Try again.');
    } finally {
      pending.current = null;
      if (live.current) setActivity(null);
    }
  }

  return <View style={styles.content}>
    {error ? <FormMessage message={error} /> : null}
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading files…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={result.code === 'not-found' || result.code === 'forbidden'
        ? 'These files are unavailable to your account.' : 'Couldn’t load files.'} />
      {result.code !== 'not-found' && result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
    </> : null}
    {result.kind === 'ready' ? <Phase shift={8}>
      {result.data.length ? <View style={styles.rows}>
        {result.data.map((asset) => <Pressable key={asset.kind} accessibilityRole="button"
          accessibilityLabel={'Open ' + titles[asset.kind] + ', ' + asset.name}
          accessibilityState={{ disabled: !!activity, busy: activity?.kind === asset.kind }}
          disabled={!!activity} testID={'attachment-' + asset.kind} onPress={() => void open(asset)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <Icon name="link" tint={color.blue} />
          <View style={styles.copy}>
            <Text style={styles.label}>{titles[asset.kind]}</Text>
            <Text style={type.caption}>{asset.name}</Text>
          </View>
          <Icon name="arrow" tint={color.blue} />
        </Pressable>)}
      </View> : <Text style={type.body}>No files are attached to this record.</Text>}
    </Phase> : null}
    {activity ? <Phase shift={8}>
      {activity.opening ? <Text accessibilityLiveRegion="polite" style={type.caption}>Opening the file…</Text> : <>
        <Text accessibilityRole="progressbar" accessibilityValue={activity.percent === null
          ? { text: 'Preparing file' } : { min: 0, max: 100, now: activity.percent }}
          style={type.caption}>{activity.percent === null ? 'Preparing file…' : 'Downloading… ' + activity.percent + '%'}</Text>
        <TextAction label="Cancel download" onPress={() => pending.current?.abort()} />
      </>}
    </Phase> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  rows: { overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  row: { minHeight: 64, padding: 12, gap: 12, alignItems: 'center', flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  copy: { flex: 1, gap: 4 },
  label: { color: color.text, fontWeight: '600', fontSize: 16 },
  pressed: { backgroundColor: color.raised },
});
