import { useState } from 'react';
import { I18nManager, StyleSheet, Text, View } from 'react-native';
import { AuthError } from '../../scm/auth-api';
import { authClient, authConfig } from '../../scm/auth-config';
import { useSession } from '../../scm/session';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { WorkspaceHeading } from '../../ui/Brand';
import { Screen, type } from '../../ui/Primitives';
import { IncidentActivityList, IncidentOverview, WorkspaceTabs } from '../../ui/Workspace';

const sections = ['Incidents', 'Activity'] as const;
const readIncidents: NonNullable<typeof authClient>['workspace'] = (grant, signal) => {
  if (!authClient) return Promise.reject(new AuthError('unavailable'));
  return authClient.workspace(grant, signal);
};

export default function WorkspaceScreen() {
  const { state } = useSession();
  const [pane, setPane] = useState({ index: 0, shift: 0 });
  const { result, lastReady, reload } = useProtectedRead(readIncidents);
  if (state.kind !== 'active') return null;
  const company = state.session.identity.companyName;
  return <Screen workspace>
    <WorkspaceHeading title="Service desk" context={authConfig?.fixture ? `${company} · Local test server` : company} />
    <View style={styles.tabs}>
      <WorkspaceTabs labels={sections} index={pane.index} onSelect={(index) => setPane((current) => index === current.index ? current : {
        index, shift: 16 * Math.sign(index - current.index) * (I18nManager.isRTL ? -1 : 1),
      })} />
    </View>
    <Phase key={pane.index} shift={pane.shift}>
      {lastReady && (pane.index === 0 ? <IncidentOverview data={lastReady} /> : <IncidentActivityList items={lastReady.activity} />)}
      {result.kind === 'loading'
        ? <Text accessibilityLiveRegion="polite" style={type.caption}>{lastReady ? 'Refreshing incidents…' : 'Loading incidents…'}</Text>
        : <TextAction label={result.kind === 'error' ? 'Try again' : 'Refresh incidents'} testID="workspace-refresh" onPress={reload} />}
      {result.kind === 'error' && <FormMessage message={lastReady ? 'Couldn’t refresh. The last results are still shown.' : 'Couldn’t load your incidents.'} />}
    </Phase>
  </Screen>;
}

const styles = StyleSheet.create({ tabs: { marginVertical: 20 } });
