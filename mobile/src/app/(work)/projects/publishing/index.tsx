import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../../../../scm/auth-api';
import { authClient } from '../../../../scm/auth-config';
import { useProtectedRead } from '../../../../scm/protected-read';
import type { PublishCustomer, PublishPath } from '../../../../scm/publishing-contract';
import { FormMessage, Phase, SearchField, TextAction } from '../../../../ui/Access';
import { WorkspaceHeading } from '../../../../ui/Brand';
import { Action, Icon, Screen, type } from '../../../../ui/Primitives';
import { color } from '../../../../ui/theme';

const levels = ['Function', 'Product suite', 'Tool', 'Customer', 'Purchase orders'];

export default function PublishingScreen() {
  const [path, setPath] = useState<string[]>([]);
  const [shift, setShift] = useState(16);
  const chosen = path.length === 4 ? { phase: path[0], suite: path[1], tool: path[2], customer: path[3] } : null;

  function navigate(next: string[]) {
    Keyboard.dismiss();
    setShift(next.length > path.length ? 16 : -16);
    setPath(next);
  }

  return <Screen workspace keyboard>
    <WorkspaceHeading title="Publish Project" />
    <View style={styles.content}>
      <TextAction label={path.length ? 'Back to ' + levels[path.length - 1].toLowerCase() + ' selection' : 'All projects'}
        onPress={() => {
          if (path.length) navigate(path.slice(0, -1));
          else if (router.canGoBack()) router.back();
          else router.replace('/projects');
        }} />
      {path.length ? <View style={styles.breadcrumbs}>
        {path.map((label, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={'Change ' + levels[index].toLowerCase() + ', ' + label}
          style={({ pressed }) => [styles.crumb, pressed && styles.pressed]} onPress={() => navigate(path.slice(0, index))}>
          <Text style={type.caption}>{label}</Text>
        </Pressable>)}
      </View> : null}
      <Phase key={JSON.stringify(path)} shift={shift}>
        {chosen ? <Orders path={chosen} /> : <Branches phase={path[0]} suite={path[1]} tool={path[2]}
          level={path.length} select={(label) => navigate([...path, label])} />}
      </Phase>
    </View>
  </Screen>;
}

function Branches({ phase, suite, tool, level, select }: PublishPath & { level: number; select: (value: string) => void }) {
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [pages, setPages] = useState<string[]>([]);
  const after = pages.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.publishTree(grant, { phase, suite, tool }, term || undefined, after, signal)
    : Promise.reject(new AuthError('unavailable')), [after, phase, suite, term, tool]);
  const { result, reload } = useProtectedRead(read);
  const heading = levels[level];
  const next = result.kind === 'ready' ? result.data.next : null;

  function search(value: string) {
    Keyboard.dismiss();
    setPages([]);
    setTerm(value.trim());
  }

  return <>
    <Text accessibilityRole="header" style={styles.heading}>{heading}</Text>
    <SearchField label={'Search by ' + heading.toLowerCase()} placeholder={heading} value={input} onChange={setInput}
      onSubmit={() => search(input)} onClear={input || term ? () => { setInput(''); search(''); } : undefined} testID="publish-search" />
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading project groups…</Text> : null}
    {result.kind === 'error' ? <ReadError code={result.code} reload={reload} /> : null}
    {result.kind === 'ready' ? <Phase key={JSON.stringify([term, after])} shift={10}>
      {result.data.items.length ? <View style={styles.rows}>
        {result.data.items.map(({ label, completedWeight }) => <PublishRow key={label} title={label}
          subtitle={completedWeight === null ? undefined : completedWeight + '% completed weight'} onPress={() => select(label)} />)}
      </View> : <Text style={type.body}>{term ? 'No entries match your search.' : level === 3
        ? 'No customers have completed work in this group.' : 'There’s no work available in this group.'}</Text>}
      <PageControls previous={pages.length ? () => setPages(pages.slice(0, -1)) : undefined}
        next={next ? () => setPages([...pages, next]) : undefined} />
    </Phase> : null}
  </>;
}

function Orders({ path }: { path: PublishCustomer }) {
  const [pages, setPages] = useState<number[]>([]);
  const before = pages.at(-1);
  const { phase, suite, tool, customer } = path;
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.publishOrders(grant, { phase, suite, tool, customer }, before, signal)
    : Promise.reject(new AuthError('unavailable')), [before, customer, phase, suite, tool]);
  const { result, reload } = useProtectedRead(read);
  const next = result.kind === 'ready' ? result.data.next : null;
  return <>
    <Text accessibilityRole="header" style={styles.heading}>Purchase orders</Text>
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading purchase orders…</Text> : null}
    {result.kind === 'error' ? <ReadError code={result.code} reload={reload} /> : null}
    {result.kind === 'ready' ? <Phase key={before ?? 'first'} shift={10}>
      {result.data.items.length ? <View style={styles.rows}>
        {result.data.items.map((item) => <PublishRow key={item.id} title={item.reference}
          subtitle={[item.number, item.tool, item.status].filter(Boolean).join(' · ')}
          onPress={() => router.push({ pathname: '/projects/publishing/[id]', params: { id: String(item.id) } })} />)}
      </View> : <Text style={type.body}>No purchase orders are available to your account for this customer.</Text>}
      <PageControls previous={pages.length ? () => setPages(pages.slice(0, -1)) : undefined}
        next={next ? () => setPages([...pages, next]) : undefined} />
    </Phase> : null}
  </>;
}

function PublishRow({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.copy}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
    </View>
    <Icon name="arrow" size={18} tint={color.blue} />
  </Pressable>;
}

function ReadError({ code, reload }: { code?: AuthError['code']; reload: () => void }) {
  const unavailable = code === 'forbidden' || code === 'not-found';
  return <>
    <FormMessage message={unavailable ? 'This project group is unavailable to your account.' : 'Couldn’t load the publishing catalog.'} />
    {unavailable ? null : <TextAction label="Try again" onPress={reload} />}
  </>;
}

function PageControls({ previous, next }: { previous?: () => void; next?: () => void }) {
  return previous || next ? <View style={styles.breadcrumbs}>
    {previous ? <Action label="Previous page" secondary icon="back" onPress={previous} /> : null}
    {next ? <Action label="Next page" secondary onPress={next} /> : null}
  </View> : null;
}

const styles = StyleSheet.create({
  content: { gap: 16, marginTop: 12 },
  heading: { color: color.text, fontSize: 20, fontWeight: '600' },
  breadcrumbs: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  crumb: { minHeight: 44, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12,
    backgroundColor: color.panel, borderColor: color.edge, borderWidth: 1 },
  rows: { gap: 8 },
  row: { minHeight: 64, padding: 12, gap: 12, flexDirection: 'row', alignItems: 'center', borderRadius: 8,
    borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel },
  copy: { flex: 1, gap: 4 },
  title: { color: color.text, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.78 },
});
