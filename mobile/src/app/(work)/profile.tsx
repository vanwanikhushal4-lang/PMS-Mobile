import { useState } from 'react';
import { AuthError } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import type { Identity } from '../../scm/auth-contract';
import { useSession } from '../../scm/session';
import { useProtectedRead } from '../../scm/protected-read';
import { FormMessage, Phase, TextAction } from '../../ui/Access';
import { WorkspaceHeading } from '../../ui/Brand';
import { Action, DetailRecord, Screen, type } from '../../ui/Primitives';
import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  const { state } = useSession();
  if (state.kind !== 'active') return null;
  return <Screen workspace>
    <WorkspaceHeading title="Profile" context={state.session.identity.companyName} />
    <View style={styles.content}><Profile identity={state.session.identity} /></View>
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

const styles = StyleSheet.create({ content: { gap: 18, marginTop: 20 } });
