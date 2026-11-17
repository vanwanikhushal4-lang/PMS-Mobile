import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import type { DocumentReviewDecision, ProjectRecordDetail, ProjectRecordTarget } from '../scm/projects-contract';
import { useSession } from '../scm/session';
import { Field, FormMessage, Phase, TextAction } from './Access';
import { Action } from './Primitives';
import { color } from './theme';

export function ProjectReviewActions({ target, review, onRefresh }: {
  target: ProjectRecordTarget;
  review: NonNullable<ProjectRecordDetail['review']>;
  onRefresh: (feedback: { success: boolean; message: string }) => void;
}) {
  const { state, expire } = useSession();
  const [decision, setDecision] = useState<DocumentReviewDecision['decision'] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function submit() {
    if (!decision || !authClient || state.kind !== 'active' || pending.current) return;
    if (decision === 'reject' && !reason.trim()) {
      setError('Enter a reason for rejecting this document.');
      return;
    }
    const request = new AbortController();
    pending.current = request;
    const { grant } = state;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      await authClient.reviewProjectRecord(grant, target, decision === 'approve'
        ? { decision, revision: review.revision }
        : { decision, revision: review.revision, reason: reason.trim() }, request.signal);
      if (!request.signal.aborted) onRefresh({ success: true, message: decision === 'approve' ? 'Document approved' : 'Document rejected' });
    } catch (failure) {
      if (request.signal.aborted) return;
      const code = failure instanceof AuthError ? failure.code : null;
      if (code === 'expired') expire(grant.sessionToken);
      else onRefresh({ success: false, message: code === 'project-review-conflict'
        ? 'This document changed. Review its current details before deciding.'
        : code === 'forbidden' || code === 'not-found' ? 'This review is unavailable to your account.'
          : 'Couldn’t confirm the decision. Check the document’s current status.' });
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>Decision</Text>
    {decision ? <Phase key={decision} shift={12}><View style={styles.confirmation}>
      <Text style={styles.heading}>{decision === 'approve' ? 'Approve this document?' : 'Reject this document?'}</Text>
      {decision === 'reject' ? <Field label="Rejection reason" value={reason} onChangeText={setReason} editable={!busy} multiline
        maxLength={255} autoCapitalize="sentences" testID="document-rejection-reason" style={styles.reason} /> : null}
      {error ? <FormMessage message={error} /> : null}
      <Action label={busy ? 'Saving decision…' : decision === 'approve' ? 'Confirm approval' : 'Confirm rejection'}
        icon="check" busy={busy} testID="document-review-submit" onPress={() => void submit()} />
      <TextAction label="Cancel" disabled={busy} onPress={() => {
        Keyboard.dismiss(); setDecision(null); setReason(''); setError('');
      }} />
    </View></Phase> : <View style={styles.choices}>
      <Action label="Approve" icon="check" testID="document-review-approve" onPress={() => setDecision('approve')} />
      {review.canReject ? <TextAction label="Reject" testID="document-review-reject" onPress={() => setDecision('reject')} /> : null}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { color: color.text, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  confirmation: { gap: 12, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  reason: { minHeight: 96, textAlignVertical: 'top' },
});
