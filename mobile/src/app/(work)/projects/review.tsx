import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../scm/auth-api';
import { authClient } from '../../../scm/auth-config';
import type { DocumentReviewScope } from '../../../scm/projects-contract';
import { useProtectedRead } from '../../../scm/protected-read';
import { useSession } from '../../../scm/session';
import { FormMessage, Phase, TextAction } from '../../../ui/Access';
import { BrandedTopBar } from '../../../ui/Brand';
import { Action, Icon, Screen, type } from '../../../ui/Primitives';
import { WorkspaceTabs } from '../../../ui/Workspace';
import { color } from '../../../ui/theme';

const queueTabs = ['Understanding', 'Requirements'] as const;

export default function DocumentReviewScreen() {
  const { state } = useSession();
  const capabilities = state.kind === 'active' ? state.session.identity.capabilities : [];
  const canReviewUnderstanding = capabilities.includes('projects.understanding-review');
  const canReviewRequirement = capabilities.includes('projects.requirement-review');
  const [selection, select] = useState<DocumentReviewScope>('understanding');
  const scope = canReviewRequirement && (selection === 'requirement' || !canReviewUnderstanding) ? 'requirement'
    : canReviewUnderstanding ? 'understanding' : null;
  const index = scope === 'requirement' ? 1 : 0;
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!scope) return Promise.reject(new AuthError('forbidden'));
    return authClient ? authClient.documentReviewQueue(grant, scope, before, signal) : Promise.reject(new AuthError('unavailable'));
  }, [before, scope]);
  const { result, reload } = useProtectedRead(read);
  const ready = result.kind === 'ready' ? result.data : null;
  const nextPage = ready?.next;

  return <Screen workspace>
    <BrandedTopBar><TextAction label="Projects" onPress={() => router.canGoBack() ? router.back() : router.replace('/projects')} /></BrandedTopBar>
    <View style={styles.content}>
      <Text accessibilityRole="header" style={type.title}>Document review</Text>
      {canReviewRequirement && canReviewUnderstanding ? <WorkspaceTabs labels={queueTabs} index={index} onSelect={(next) => {
        if (next === index) return;
        select(next === 1 ? 'requirement' : 'understanding');
        setCursors([]);
      }} /> : null}
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading pending reviews…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'Your account doesn’t have access to this review queue.' : 'Couldn’t load pending reviews.'} />
        {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {ready && scope ? <Phase shift={10} key={scope + String(before)}>
        {!ready.items.length ? <Text accessibilityLiveRegion="polite" style={type.body}>No documents are waiting for review.</Text> : null}
        <View style={styles.list}>
          {ready.items.map((item) => <Pressable key={item.id} accessibilityRole="button"
            accessibilityLabel={[item.reference || 'Document', item.projectName || item.projectReference, item.date].filter(Boolean).join(', ')}
            testID={`review-record-${item.id}`} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/projects/[id]/records/[scope]/[recordId]', params: {
              id: item.projectId, recordId: item.id, scope, source: 'review',
            } })}>
            <View style={styles.label}>
              <Text style={styles.reference}>{item.reference || 'Document'}</Text>
              <Text style={type.body}>{item.projectName || item.projectReference || 'Unnamed project'}</Text>
              {item.date ? <Text style={type.caption}>{item.date}</Text> : null}
            </View>
            <Icon name="arrow" tint={color.blue} />
          </Pressable>)}
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
  pressed: { backgroundColor: color.raised },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 16 },
});
