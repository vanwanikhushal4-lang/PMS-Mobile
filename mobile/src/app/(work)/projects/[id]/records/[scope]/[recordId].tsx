import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../../../../scm/auth-api';
import { authClient } from '../../../../../../scm/auth-config';
import { isProjectRecordScope, projectRecordSections, projectRecordTitles } from '../../../../../../scm/projects-contract';
import { useProtectedRead } from '../../../../../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../../../../../ui/Access';
import { BrandedTopBar } from '../../../../../../ui/Brand';
import { DetailRecord, Screen, type } from '../../../../../../ui/Primitives';
import { ProjectAttachmentPanel } from '../../../../../../ui/ProjectAttachmentPanel';
import { color } from '../../../../../../ui/theme';

function routeId(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return 0;
  const id = Number(value);
  return id <= 2_147_483_647 ? id : 0;
}

export default function ProjectRecordScreen() {
  const params = useLocalSearchParams<{ id: string; scope: string; recordId: string }>();
  const scope = isProjectRecordScope(params.scope) ? params.scope : null;
  const id = routeId(params.id);
  const recordId = routeId(params.recordId);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!scope || !id || !recordId) return Promise.reject(new AuthError('not-found'));
    return authClient ? authClient.projectRecordDetail(grant, { scope, id, recordId }, signal)
      : Promise.reject(new AuthError('unavailable'));
  }, [scope, id, recordId]);
  const { result, reload } = useProtectedRead(read);
  const title = scope ? projectRecordTitles[scope] : 'Project record';
  const detail = result.kind === 'ready' ? result.data : null;
  const missing = result.kind === 'error' && (result.code === 'not-found' || result.code === 'forbidden');

  function back() {
    if (router.canGoBack()) router.back();
    else if (id) router.replace({ pathname: '/projects/[id]', params: { id, view: 'records' } });
    else router.replace('/projects');
  }

  return <Screen workspace>
    <BrandedTopBar><TextAction label="Project records" onPress={back} /></BrandedTopBar>
    <View style={styles.content}>
      <View style={styles.header}>
        {detail?.item.reference ? <Text style={type.eyebrow}>{title}</Text> : null}
        <Text accessibilityRole="header" style={type.title}>{detail?.item.reference || title}</Text>
        {detail?.item.status ? <Text style={type.eyebrow}>{detail.item.status}</Text> : null}
        {detail ? <Text style={type.body}>{[detail.item.date, detail.item.format].filter(Boolean).join(' · ') || 'Date unavailable'}</Text> : null}
      </View>
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading record…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={missing ? 'This record is unavailable to your account.' : 'Couldn’t load this record.'} />
        {missing ? null : <TextAction label="Try again" onPress={reload} />}
      </> : null}
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
});
