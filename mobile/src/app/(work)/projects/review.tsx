import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../scm/auth-api';
import { authClient } from '../../../scm/auth-config';
import type { DocumentQueueMode, DocumentReviewScope } from '../../../scm/projects-contract';
import { useProtectedRead } from '../../../scm/protected-read';
import { useSession } from '../../../scm/session';
import { FormMessage, Phase, TextAction } from '../../../ui/Access';
import { BrandedTopBar } from '../../../ui/Brand';
import { Action, Icon, Screen, type } from '../../../ui/Primitives';
import { WorkspaceTabs } from '../../../ui/Workspace';
import { color } from '../../../ui/theme';

const queueTabs = ['Understanding', 'Requirements'] as const;
const decisionTabs = ['Pending', 'Approved', 'Rejected'] as const;
const requirementTabs = ['Pending', 'Approved'] as const;
const reviewModes = ['pending', 'approved', 'rejected'] as const;
const emptyMessages: Record<DocumentQueueMode, string> = {
  pending: 'No documents are waiting for review.', approved: 'No approved documents.',
  rejected: 'No rejected documents.', submitted: 'You haven’t submitted any linked requirements.',
};

export default function DocumentReviewScreen() {
  const { state } = useSession();
  const capabilities = state.kind === 'active' ? state.session.identity.capabilities : [];
  const canReviewUnderstanding = capabilities.includes('projects.understanding-review');
  const canReviewRequirement = capabilities.includes('projects.requirement-review');
  const submitted = !canReviewUnderstanding && !canReviewRequirement && capabilities.includes('projects.requirements-submitted');
  const [selection, select] = useState<DocumentReviewScope>('understanding');
  const [filter, setFilter] = useState<(typeof reviewModes)[number]>('pending');
  const scope = submitted || (canReviewRequirement && (selection === 'requirement' || !canReviewUnderstanding)) ? 'requirement'
    : canReviewUnderstanding ? 'understanding' : null;
  const index = scope === 'requirement' ? 1 : 0;
  const mode = submitted ? 'submitted' : scope === 'requirement' && filter === 'rejected' ? 'pending' : filter;
  const statusIndex = mode === 'approved' ? 1 : mode === 'rejected' ? 2 : 0;
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!scope) return Promise.reject(new AuthError('forbidden'));
    return authClient ? authClient.documentReviewQueue(grant, scope, before, signal, mode) : Promise.reject(new AuthError('unavailable'));
  }, [before, scope, mode]);
  const { result, reload } = useProtectedRead(read);
  const ready = result.kind === 'ready' ? result.data : null;
  const nextPage = ready?.next;

  return <Screen workspace>
    <BrandedTopBar><TextAction label="Projects" onPress={() => router.canGoBack() ? router.back() : router.replace('/projects')} /></BrandedTopBar>
    <View style={styles.content}>
      <Text accessibilityRole="header" style={type.title}>{submitted ? 'My requirements' : 'Document review'}</Text>
      {canReviewRequirement && canReviewUnderstanding ? <WorkspaceTabs labels={queueTabs} index={index} onSelect={(next) => {
        if (next === index) return;
        select(next === 1 ? 'requirement' : 'understanding');
        if (next === 1 && filter === 'rejected') setFilter('pending');
        setCursors([]);
      }} /> : null}
      {!submitted && scope ? <WorkspaceTabs labels={scope === 'requirement' ? requirementTabs : decisionTabs} index={statusIndex}
        onSelect={(next) => {
          if (next === statusIndex) return;
          setFilter(reviewModes[next]);
          setCursors([]);
        }} /> : null}
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading documents…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'These documents are unavailable to your account.' : 'Couldn’t load documents.'} />
        {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {ready && scope ? <Phase shift={10} key={`${scope}-${mode}-${before}`}>
        {!ready.items.length ? <Text accessibilityLiveRegion="polite" style={type.body}>{emptyMessages[mode]}</Text> : null}
        <View style={styles.list}>
          {ready.items.map((item) => {
            const reference = item.reference || 'Document';
            const project = item.projectName || item.projectReference || 'Unnamed project';
            const date = item.decisionDate ? `Rejected ${item.decisionDate}` : item.date ? `Submitted ${item.date}` : '';
            const status = mode !== 'pending' ? item.status : '';
            return <Pressable key={item.id} accessibilityRole="button"
              accessibilityLabel={[reference, project, status, date].filter(Boolean).join(', ')}
              testID={`review-record-${item.id}`} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/projects/[id]/records/[scope]/[recordId]', params: {
                id: item.projectId, recordId: item.id, scope, source: submitted ? 'submitted' : 'review',
              } })}>
              <View style={styles.label}>
                <Text style={styles.reference}>{reference}</Text>
                <Text style={type.body}>{project}</Text>
                {status ? <Text style={[type.caption, mode === 'approved' && styles.approved, mode === 'rejected' && styles.rejected]}>{status}</Text> : null}
                {date ? <Text style={type.caption}>{date}</Text> : null}
              </View>
              <Icon name="arrow" tint={color.blue} />
            </Pressable>;
          })}
        </View>
        {before || ready.next ? <View style={styles.pagination}>
          {before ? <Action icon="back" label="Previous page" secondary onPress={() => setCursors((pages) => pages.slice(0, -1))} /> : null}
          {nextPage ? <Action label="Next page" secondary onPress={() => setCursors((pages) => [...pages, nextPage])} /> : null}
        </View> : null}
      </Phase> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 20, paddingTop: 12 },
  list: { gap: 8 },
  row: { alignItems: 'center', flexDirection: 'row', minHeight: 72, padding: 16, gap: 16,
    borderWidth: 1, borderColor: color.edge, borderRadius: 8, backgroundColor: color.panel },
  label: { gap: 4, flex: 1 },
  reference: { color: color.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
  approved: { color: color.success },
  rejected: { color: color.error },
  pressed: { backgroundColor: color.raised },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 16 },
});
