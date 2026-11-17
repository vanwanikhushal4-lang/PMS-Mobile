import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../scm/auth-api';
import { authClient } from '../../../scm/auth-config';
import { useProtectedRead } from '../../../scm/protected-read';
import { useSession } from '../../../scm/session';
import { FormMessage, Phase, SearchField, TextAction } from '../../../ui/Access';
import { WorkspaceHeading } from '../../../ui/Brand';
import { Action, Screen, type } from '../../../ui/Primitives';
import { ProjectRow } from '../../../ui/Projects';
import { WorkspaceTabs } from '../../../ui/Workspace';

const folders = ['All projects', 'Saved'] as const;

export default function ProjectsScreen() {
  const { state } = useSession();
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [saved, setSaved] = useState(false);
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.projects(grant, { query: term, before, saved: saved || undefined }, signal);
  }, [before, saved, term]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;

  function search(value: string) {
    Keyboard.dismiss();
    setCursors([]);
    setTerm(value.trim());
  }

  return <Screen keyboard workspace>
    <WorkspaceHeading title="Projects" context={state.kind === 'active' ? state.session.identity.companyName : undefined} />
    <View style={styles.content}>
      <WorkspaceTabs labels={folders} index={saved ? 1 : 0} onSelect={(index) => {
        if (saved === (index === 1)) return;
        setSaved(index === 1);
        setCursors([]);
      }} />
      <SearchField label="Search projects" testID="project-search-query" value={input} onChange={setInput}
        placeholder="Name, customer or product" onSubmit={() => search(input)}
        onClear={input || term ? () => { setInput(''); search(''); } : undefined} />
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading projects…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'Your account doesn’t have access to projects.' : 'Couldn’t load projects.'} />
        {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {result.kind === 'ready' ? <Phase key={JSON.stringify([saved, term, before])}>
        {result.data.items.length ? <View style={styles.rows}>
          {result.data.items.map((project, index) => <ProjectRow key={project.id} item={project} index={index}
            onPress={() => router.push({ pathname: '/projects/[id]', params: { id: String(project.id) } })} />)}
        </View> : <Text accessibilityLiveRegion="polite" style={type.body}>
          {term ? 'No projects match your search.' : saved ? 'Projects you save appear here.' : 'You don’t have any assigned projects.'}
        </Text>}
        {before || next ? <View style={styles.actions}>
          {before ? <Action label="Previous page" icon="back" secondary
            onPress={() => setCursors((pages) => pages.slice(0, -1))} /> : null}
          {next ? <Action label="Next page" secondary onPress={() => setCursors((pages) => [...pages, next])} /> : null}
        </View> : null}
      </Phase> : null}
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { gap: 18, marginTop: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  rows: { gap: 8 },
});
