import { useCallback, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, type Grant } from '../scm/auth-api';
import { authClient } from '../scm/auth-config';
import { useProtectedRead } from '../scm/protected-read';
import type { StandaloneTask, TaskContext } from '../scm/tasks-contract';
import { AccessRail, FormMessage, Phase, SearchField, TextAction } from './Access';
import { Action, Icon, type } from './Primitives';
import { TaskAssignmentForm } from './TaskAssignmentForm';
import { color } from './theme';

const steps = ['Product', 'Function', 'Assignee', 'Details', 'Schedule'];

export function StandaloneTaskForm({ cancel, onDone }: { cancel: () => void; onDone: (id: number) => void }) {
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [context, setContext] = useState<TaskContext | null>(null);
  const [functionName, setFunctionName] = useState('');
  const [responsibility, setResponsibility] = useState('');
  const [scope, setScope] = useState<StandaloneTask | null>(null);
  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!authClient) return Promise.reject(new AuthError('unavailable'));
    return authClient.taskContexts(grant, term || undefined, signal);
  }, [term]);
  const { result, reload } = useProtectedRead(read);

  function search(value: string) {
    Keyboard.dismiss();
    setTerm(value.trim());
  }

  if (scope) return <Phase key="assignment" shift={18}>
    <View style={styles.context}>
      <Text style={styles.label}>{scope.context.customer}</Text>
      <Text style={type.caption}>{scope.context.suite} · {scope.context.tool}</Text>
      <Text style={type.caption}>{scope.function} · {scope.responsibility}</Text>
    </View>
    <TaskAssignmentForm target={{ kind: 'standalone', scope }} onDone={onDone}
      progress={{ labels: steps, offset: 2 }}
      cancel={() => setScope(null)} cancelLabel="Back to task context" />
  </Phase>;

  return <Phase key={context ? 'classification' : 'product'} shift={context ? 18 : -10}>
    <AccessRail labels={steps} index={context ? 1 : 0} />
    {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading your customer and product options…</Text> : null}
    {result.kind === 'error' ? <>
      <FormMessage message={result.code === 'forbidden' ? 'Your account’s SCM roster could not be verified.' : 'Couldn’t load the available customer and product options.'} />
      {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
    </> : null}
    {result.kind === 'ready' && context ? <>
      <View style={styles.context}>
        <Text style={styles.label}>{context.customer}</Text>
        <Text style={type.caption}>{context.suite} · {context.tool}</Text>
        <TextAction label="Change customer or product" onPress={() => setContext(null)} />
      </View>
      <Choice label="Function" items={result.data.functions} value={functionName} onChange={setFunctionName} />
      <Choice label="Responsibility" items={result.data.responsibilities} value={responsibility} onChange={setResponsibility} />
      {functionName && responsibility ? <Action label="Continue to assignee" testID="standalone-assignee"
        onPress={() => setScope({ context, function: functionName, responsibility })} /> : null}
    </> : null}
    {result.kind === 'ready' && !context ? <>
      <SearchField label="Find a customer or product" placeholder="Customer, suite, or tool" value={query} onChange={setQuery}
        onSubmit={() => search(query)} onClear={query || term ? () => { setQuery(''); search(''); } : undefined} testID="standalone-search" />
      {result.data.items.length ? <View style={styles.products}>
        {result.data.items.map((item) => <Pressable key={JSON.stringify(item)} accessibilityRole="button"
          style={({ pressed }) => [styles.product, pressed && styles.pressed]} onPress={() => { Keyboard.dismiss(); setContext(item); }}>
          <View style={styles.copy}>
            <Text style={styles.label}>{item.customer}</Text>
            <Text style={type.caption}>{item.suite} · {item.tool}</Text>
          </View>
          <Icon name="arrow" size={16} tint={color.muted} />
        </Pressable>)}
      </View> : <Text style={type.body}>{term ? 'No customer or product matches your search.' : 'No customer and product combinations are available in your roster.'}</Text>}
      {result.data.hasMore ? <Text style={type.caption}>Search by customer or product to narrow the list.</Text> : null}
    </> : null}
    <TextAction label="Cancel" onPress={cancel} />
  </Phase>;
}

function Choice({ label, items, value, onChange }: {
  label: string; items: readonly string[]; value: string; onChange: (value: string) => void;
}) {
  return <View style={styles.choices}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {items.map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ checked: item === value }}
        onPress={() => onChange(item)} style={({ pressed }) => [styles.option, item === value && styles.active, pressed && styles.pressed]}>
        <Text style={item === value ? styles.selected : type.body}>{item}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  context: { padding: 16, gap: 4, borderWidth: 1, borderColor: color.edge, borderRadius: 8, backgroundColor: color.panel },
  label: { color: color.text, fontSize: 16, fontWeight: '600' },
  products: { borderWidth: 1, borderColor: color.edge, borderRadius: 8, overflow: 'hidden', backgroundColor: color.panel },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  copy: { flex: 1, gap: 4 },
  choices: { gap: 8 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: color.edge, borderRadius: 8 },
  active: { backgroundColor: color.raised, borderColor: color.blue },
  selected: { ...type.body, color: color.blue, fontWeight: '600' },
  pressed: { opacity: 0.78 },
});
