import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../../../../scm/auth-api';
import { authClient } from '../../../../../../scm/auth-config';
import { isProjectRecordScope, projectRecordSections, projectRecordTitles } from '../../../../../../scm/projects-contract';
import { useProtectedRead } from '../../../../../../scm/protected-read';
import { useSession } from '../../../../../../scm/session';
import { FormMessage, Phase, TextAction } from '../../../../../../ui/Access';
import { BrandedTopBar } from '../../../../../../ui/Brand';
import { DetailRecord, Screen, type } from '../../../../../../ui/Primitives';
import { ProjectAttachmentPanel } from '../../../../../../ui/ProjectAttachmentPanel';
import { ProjectReviewActions } from '../../../../../../ui/ProjectReviewActions';
import { color } from '../../../../../../ui/theme';

function routeId(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return 0;
  const id = Number(value);
  return id <= 2_147_483_647 ? id : 0;
}

export default function ProjectRecordScreen() {
  const params = useLocalSearchParams<{ id: string; scope: string; recordId: string; source?: string }>();
  const scope = isProjectRecordScope(params.scope) ? params.scope : null;
  const id = routeId(params.id);
  const recordId = routeId(params.recordId);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!scope || !id || !recordId) return Promise.reject(new AuthError('not-found'));
    return authClient ? authClient.projectRecordDetail(grant, { scope, id, recordId }, signal)
      : Promise.reject(new AuthError('unavailable'));
  }, [scope, id, recordId]);
  const { result, reload } = useProtectedRead(read);
  const { state } = useSession();
  const title = scope ? projectRecordTitles[scope] : 'Project record';
  const detail = result.kind === 'ready' ? result.data : null;
  const missing = result.kind === 'error' && (result.code === 'not-found' || result.code === 'forbidden');
  const fromReview = params.source === 'review' || params.source === 'submitted';
  const backLabel = params.source === 'submitted' ? 'My requirements' : fromReview ? 'Document review' : 'Project records';
  const recordKey = `${scope}-${id}-${recordId}`;
  const [feedback, setFeedback] = useState<{ key: string; success: boolean; message: string } | null>(null);
  const message = feedback?.key === recordKey ? feedback : null;
  const visibleReview = !!detail?.review;
  const canSchedule = state.kind === 'active' && state.session.identity.capabilities.includes('projects.kickoff-schedule')
    && scope === 'understanding' && ['ud approved by md', 'ud approved by si'].includes(detail?.item.status.toLowerCase() ?? '');

  function back() {
    if (router.canGoBack()) router.back();
    else if (fromReview) router.replace('/projects/review');
    else if (id) router.replace({ pathname: '/projects/[id]', params: { id, view: 'records' } });
    else router.replace('/projects');
  }

  return <Screen keyboard={visibleReview} workspace>
    <BrandedTopBar><TextAction label={backLabel} onPress={back} /></BrandedTopBar>
    <View style={styles.content}>
      <View style={styles.header}>
        {detail?.item.reference ? <Text style={type.eyebrow}>{title}</Text> : null}
        <Text accessibilityRole="header" style={type.title}>{detail?.item.reference || title}</Text>
        {detail?.item.status ? <Text style={type.eyebrow}>{detail.item.status}</Text> : null}
        {detail ? <Text style={type.body}>{[detail.item.date, detail.item.format].filter(Boolean).join(' · ') || 'Date unavailable'}</Text> : null}
        {canSchedule ? <TextAction label="Schedule kickoff" testID="open-kickoff" onPress={() => router.push({
          pathname: '/projects/[id]/kickoff/[recordId]', params: { id, recordId },
        })} /> : null}
      </View>
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading record…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={missing ? 'This record is unavailable to your account.' : 'Couldn’t load this record.'} />
        {missing ? null : <TextAction label="Try again" onPress={reload} />}
      </> : null}
      {message ? <Phase>
        {message.success ? <Text style={styles.success} accessibilityLiveRegion="polite">{message.message}</Text>
          : <FormMessage message={message.message} />}
      </Phase> : null}
      {scope && detail ? <Phase shift={14}>
        <View style={styles.sections}>
          {projectRecordSections[scope].map((section) => {
            const rows = section.rows.flatMap(([key, label]) => detail.fields[key] ? [[label, detail.fields[key]] as const] : []);
            return rows.length ? <View key={section.title} style={styles.section}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
              <DetailRecord selectable rows={rows} />
            </View> : null;
          })}
          {!Object.keys(detail.fields).length ? <Text style={type.body}>No additional details were recorded.</Text> : null}
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Files</Text>
            <ProjectAttachmentPanel key={`${scope}-${id}-${recordId}`} target={{ scope, id, recordId }} />
          </View>
          {detail.review ? <ProjectReviewActions key={recordKey + detail.review.revision} target={{ scope, id, recordId }}
            review={detail.review} onRefresh={(result) => { setFeedback({ key: recordKey, ...result }); reload(); }} /> : null}
        </View>
      </Phase> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 24, paddingTop: 12 },
  header: { gap: 8, borderBottomColor: color.edge, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 16 },
  sections: { gap: 24 },
  section: { gap: 8 },
  sectionTitle: { color: color.text, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  success: { color: color.success, fontSize: 16, fontWeight: '600' },
});
