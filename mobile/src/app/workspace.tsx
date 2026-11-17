import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Animated, I18nManager, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient, authConfig } from '../scm/auth-config';
import type { Identity } from '../scm/auth-contract';
import { useSession } from '../scm/session';
import { useProtectedRead } from '../scm/protected-read';
import type { Workspace } from '../scm/workspace-contract';
import { FormMessage, Phase, TextAction } from '../ui/Access';
import { VeloxMark } from '../ui/Brand';
import { Action, DetailRecord, Screen, type } from '../ui/Primitives';
import { IncidentActivityList, IncidentOverview, WorkspaceTabs } from '../ui/Workspace';
import { useArrival, useFocusedForeground } from '../ui/motion';
import { color } from '../ui/theme';

const sections = ['Overview', 'Activity', 'Profile'] as const;
type Load = { revision: number; phase: 'ready' | 'error'; data: Workspace | null };

export default function WorkspaceScreen() {
  const { state } = useSession();
  if (state.kind !== 'active') return null;
  return <WorkspaceContent key={state.grant.sessionToken} grant={state.grant} identity={state.session.identity} />;
}

function WorkspaceContent({ grant: { sessionToken, expiresAt }, identity }: { grant: Grant; identity: Identity }) {
  const { expire } = useSession();
  const focused = useFocusedForeground();
  const [route, setRoute] = useState({ index: 0, shift: 0 });
  const [refresh, setRefresh] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const arrival = useArrival(0, 12);
  const title = ['My incidents', 'Incident activity', 'My profile'][route.index];
  const phase = load?.revision === refresh ? load.phase : 'loading';
  const data = load?.data;

  useEffect(() => {
    if (!focused || !authClient) return;
    const request = new AbortController();
    void authClient.workspace({ sessionToken, expiresAt }, request.signal).then((data) => {
      if (!request.signal.aborted) setLoad({ revision: refresh, phase: 'ready', data });
    }).catch((error: unknown) => {
      if (request.signal.aborted) return;
      if (error instanceof AuthError && error.code === 'expired') expire(sessionToken);
      else setLoad((current) => ({ revision: refresh, phase: 'error', data: current?.data ?? null }));
    });
    return () => request.abort();
  }, [expire, expiresAt, focused, refresh, sessionToken]);

  function select(index: number) {
    setRoute((current) => index === current.index ? current : {
      index,
      shift: 16 * Math.sign(index - current.index) * (I18nManager.isRTL ? -1 : 1),
    });
  }

  return <Screen>
    <Animated.View style={[styles.header, arrival]}>
      <VeloxMark />
      <View style={styles.companyDetails}>
        <Text style={styles.company}>{identity.companyName}</Text>
        {authConfig?.fixture ? <Text style={type.caption}>Local test server</Text> : null}
      </View>
    </Animated.View>
    <WorkspaceTabs labels={sections} index={route.index} onSelect={select} />
    <Phase key={route.index} shift={route.shift}>
      <Text accessibilityRole="header" testID="workspace-title" style={type.title}>{title}</Text>
      {route.index === 2 ? <Profile identity={identity} /> : <>
        {data ? route.index === 0 ? <IncidentOverview data={data} />
          : <IncidentActivityList items={data.activity} /> : null}
        {phase === 'error' ? <FormMessage message={data
          ? 'Couldn’t refresh. The last results are still shown.'
          : 'Couldn’t load your incidents. Check your connection and try again.'} /> : null}
        {phase === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>
          {data ? 'Refreshing incidents…' : 'Loading incidents…'}
        </Text> : <TextAction label={phase === 'error' ? 'Try again' : 'Refresh incidents'} testID="workspace-refresh"
          onPress={() => setRefresh((value) => value + 1)} />}
        {route.index === 0 && identity.capabilities.includes('projects.read')
          ? <Action label="My projects" testID="open-projects" secondary onPress={() => router.push('/projects')} /> : null}
        {route.index === 0 && identity.capabilities.includes('tasks.assigned-by-me')
          ? <Action label="Tasks" testID="open-assigned-tasks" secondary onPress={() => router.push('/tasks')} /> : null}
      </>}
    </Phase>
  </Screen>;
}

const readProfile: NonNullable<typeof authClient>['profile'] = (grant, signal) => {
  if (!authClient) return Promise.reject(new AuthError('unavailable'));
  return authClient.profile(grant, signal);
};

function Profile({ identity }: { identity: Identity }) {
  const { signOut } = useSession();
  const { result, reload } = useProtectedRead(readProfile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function exit() {
    if (busy) return;
    setMessage('');
    setBusy(true);
    try { await signOut(); }
    catch { setMessage('Couldn’t confirm sign-out. Check your connection and try again.'); setBusy(false); }
  }

  const details: [string, string][] = [
    ['Full name', identity.displayName],
    ['Username', identity.username],
    ['Company', identity.companyName],
    ['Role', identity.role],
  ];
  if (identity.designation) details.push(['Designation', identity.designation]);
  const contact = result.kind === 'ready' ? result.data : null;
  return <>
    <DetailRecord rows={details} />
    {contact ? <Phase>
      <Text accessibilityRole="header" style={type.body}>Work and contact</Text>
      <DetailRecord rows={[
        ['Location', contact.location], ['Site', contact.site], ['Department', contact.department],
        ['Subdepartment', contact.subdepartment], ['Work email', contact.email], ['Phone', contact.phone],
      ]} />
    </Phase> : null}
    {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading work and contact details…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message="Couldn’t load your work and contact details." />
      <TextAction label="Try again" onPress={reload} />
    </> : null}
    {message ? <FormMessage message={message} /> : null}
    <Action label={busy ? 'Signing out…' : 'Sign out'} icon="exit" secondary testID="workspace-sign-out" busy={busy} onPress={() => void exit()} />
  </>;
}

const styles = StyleSheet.create({
  header: { gap: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  companyDetails: { flex: 1, gap: 4 },
  company: { color: color.text, fontSize: 17, lineHeight: 24, fontWeight: '600' },
});
