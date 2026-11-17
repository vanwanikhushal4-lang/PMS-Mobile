import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../scm/auth-api';
import { authClient } from '../../scm/auth-config';
import { useProtectedRead } from '../../scm/protected-read';
import { Field, FormMessage, Phase, TextAction } from '../../ui/Access';
import { BrandedTopBar } from '../../ui/Brand';
import { Action, Screen, type } from '../../ui/Primitives';
import { ProjectRow } from '../../ui/Projects';

export default function ProjectsScreen() {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [cursors, setCursors] = useState<number[]>([]);
  const before = cursors.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.projects(grant, { query: term, before }, signal);
  }, [before, term]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;

  function search(value: string) {
    Keyboard.dismiss();
    setCursors([]);
    setTerm(value.trim());
  }

  return <Screen keyboard>
    <BrandedTopBar>
      <TextAction label="Back to workspace" onPress={() => router.canGoBack() ? router.back() : router.replace('/workspace')} />
    </BrandedTopBar>
    <View style={styles.content}>
      <Text accessibilityRole="header" style={type.title}>My projects</Text>
      <View style={styles.search}>
        <Field label="Search projects" testID="project-search-query" value={input} onChangeText={setInput}
          placeholder="Name, customer or product" maxLength={120} returnKeyType="search" onSubmitEditing={() => search(input)} />
        <View style={styles.actions}>
          <TextAction label="Search" testID="project-search" onPress={() => search(input)} />
          {input || term ? <TextAction label="Clear search" onPress={() => { setInput(''); search(''); }} /> : null}
        </View>
      </View>
      {result.kind === 'loading' ? <Text accessibilityLiveRegion="polite" style={type.caption}>Loading projects…</Text> : null}
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'Your account doesn’t have access to projects.' : 'Couldn’t load projects.'} />
        {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {result.kind === 'ready' ? <Phase key={JSON.stringify([term, before])}>
        {result.data.items.length ? <View style={styles.rows}>
          {result.data.items.map((project, index) => <ProjectRow key={project.id} item={project} index={index}
            onPress={() => router.push({ pathname: '/projects/[id]', params: { id: String(project.id) } })} />)}
        </View> : <Text accessibilityLiveRegion="polite" style={type.body}>
          {term ? 'No assigned projects match your search.' : 'You don’t have any assigned projects.'}
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
  content: { gap: 20, marginTop: 12 },
  search: { gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  rows: { gap: 8 },
});
