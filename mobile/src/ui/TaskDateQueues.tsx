import { useCallback, useState } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import type { DateQueue } from '../scm/tasks-contract';
import { FormMessage, Phase, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { TaskDatePanel } from './TaskDatePanel';
import { WorkspaceTabs } from './Workspace';
import { color } from './theme';

const options = ['My requests', 'Team tasks', 'Approvals'];
const queues: DateQueue[] = ['mine', 'team', 'review'];
const emptyMessages = ['You have no date requests.', 'You have no team tasks available for revision.', 'You have no date requests to approve.'];

export function TaskDateQueues({ initialTask }: { initialTask: number | null }) {
  const [tab, setTab] = useState({ index: 0, shift: 0 });
  const [open, setOpen] = useState<number | null>(initialTask);
  const [pages, setPages] = useState<number[]>([]);
  const [message, setMessage] = useState(initialTask ? 'Date request sent' : '');
  const queue = queues[tab.index];
  const before = pages.at(-1);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.dateQueue(grant, queue, before, signal);
  }, [before, queue]);
  const { result, reload } = useProtectedRead(read);

  function select(index: number) {
    if (index === tab.index) return;
    setTab({ index, shift: 16 * Math.sign(index - tab.index) * (I18nManager.isRTL ? -1 : 1) });
    setMessage('');
    setOpen(null);
    setPages([]);
  }

  return <View style={styles.content}>
    <WorkspaceTabs labels={options} index={tab.index} onSelect={select} />
    {message ? <Phase><Text style={styles.success} accessibilityLiveRegion="polite">{message}</Text></Phase> : null}
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading task dates…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message="Couldn’t load this date queue." />
      <TextAction label="Try again" onPress={reload} />
    </> : null}
    {result.kind === 'ready' ? <Phase key={queue + ':' + (before ?? '')} shift={tab.shift}>
      {result.data.items.length ? <View style={styles.rows}>
        {result.data.items.map((task) => <View key={task.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: task.id === open }}
            onPress={() => setOpen(task.id === open ? null : task.id)} testID={'date-task-' + task.id}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <View style={styles.copy}>
              <Text style={type.eyebrow}>T-{task.id}{task.dateApproval ? ' · ' + task.dateApproval : ''}</Text>
              <Text style={styles.title}>{task.module || 'Task ' + task.id}</Text>
              {task.developer ? <Text style={type.caption}>{task.developer}</Text> : null}
            </View>
            <Icon name="arrow" tint={color.blue} />
          </Pressable>
          {open === task.id ? <Phase><View style={styles.details}>
            <TaskDatePanel id={task.id} onChanged={(action) => {
              setMessage(action === 'request' ? 'Date request sent' : 'Dates approved');
              setOpen(queue === 'mine' ? task.id : null);
              reload();
            }} />
          </View></Phase> : null}
        </View>)}
      </View> : <Text style={type.body}>{emptyMessages[tab.index]}</Text>}
      {before || result.data.next ? <View style={styles.actions}>
        {before ? <Action label="Previous page" icon="back" secondary onPress={() => { setOpen(null); setPages(pages.slice(0, -1)); }} /> : null}
        {result.data.next ? <Action label="Next page" secondary onPress={() => {
          if (result.data.next !== null) { setOpen(null); setPages([...pages, result.data.next]); }
        }} /> : null}
      </View> : null}
    </Phase> : null}
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  rows: { gap: 8 },
  card: { borderRadius: 8, borderWidth: 1, borderColor: color.edge, backgroundColor: color.panel, overflow: 'hidden' },
  button: { minHeight: 72, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, gap: 4 },
  pressed: { backgroundColor: color.raised },
  title: { color: color.text, fontSize: 17, fontWeight: '600' },
  success: { color: color.success, fontSize: 16, fontWeight: '600' },
  details: { paddingHorizontal: 12, paddingBottom: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
