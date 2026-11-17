import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, submissionKey, type Grant } from '../../../scm/auth-api';
import { authClient } from '../../../scm/auth-config';
import { useProtectedRead } from '../../../scm/protected-read';
import { useSession } from '../../../scm/session';
import type { TaskContext } from '../../../scm/tasks-contract';
import { AccessRail, Field, FormMessage, Phase, SearchField, TextAction } from '../../../ui/Access';
import { WorkspaceHeading } from '../../../ui/Brand';
import { Action, DetailRecord, Icon, Screen, type } from '../../../ui/Primitives';
import { color } from '../../../ui/theme';

const steps = ['Product', 'Function', 'Details', 'Review'];

export default function CreateProjectScreen() {
  const { state } = useSession();
  if (state.kind !== 'active') return null;
  return <Screen keyboard workspace>
    <WorkspaceHeading title="Create project" context={state.session.identity.companyName} />
    {state.session.identity.capabilities.includes('projects.create')
      ? <ProjectForm /> : <View style={styles.content}>
        <FormMessage message="Your account doesn’t have access to create projects." />
        <TextAction label="All projects" onPress={close} />
      </View>}
  </Screen>;
}

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/projects');
}

function ProjectForm() {
  const { state, expire } = useSession();
  const [requestKey] = useState(submissionKey);
  const [step, setStep] = useState(0);
  const [shift, setShift] = useState(16);
  const [productInput, setProductInput] = useState('');
  const [productTerm, setProductTerm] = useState('');
  const [functionInput, setFunctionInput] = useState('');
  const [functionTerm, setFunctionTerm] = useState('');
  const [context, setContext] = useState<TaskContext | null>(null);
  const [functionName, setFunctionName] = useState('');
  const [name, setName] = useState('');
  const [responsibility, setResponsibility] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const read = useCallback((grant: Grant, signal: AbortSignal) => authClient
    ? authClient.projectCreateOptions(grant, { query: productTerm || undefined, functionQuery: functionTerm || undefined }, signal)
    : Promise.reject(new AuthError('unavailable')), [functionTerm, productTerm]);
  const { result, reload } = useProtectedRead(read);

  function go(next: number) {
    Keyboard.dismiss();
    setShift(next > step ? 16 : -16);
    setStep(next);
    setError('');
  }

  function search(value: string) {
    Keyboard.dismiss();
    if (step === 0) setProductTerm(value.trim());
    else setFunctionTerm(value.trim());
  }

  async function save() {
    if (!authClient || !context || state.kind !== 'active' || pending.current) return;
    const { grant } = state;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    try {
      const project = await authClient.createProject(grant, { context, name: name.trim(), function: functionName, responsibility, requestKey },
        request.signal);
      if (!request.signal.aborted) router.replace({ pathname: '/projects/[id]', params: { id: String(project.id), created: '1' } });
    } catch (failure) {
      if (request.signal.aborted) return;
      const code = failure instanceof AuthError ? failure.code : null;
      setUncertain(code === 'transport' || code === 'unavailable' || code === 'bad-response');
      if (code === 'expired') expire(grant.sessionToken);
      else if (code === 'project-context-unavailable') {
        setContext(null);
        go(0);
        setError('Your account can no longer use that customer and product combination.');
        reload();
      } else if (code === 'project-function-unavailable') {
        setFunctionName('');
        go(1);
        setError('That function is no longer available in SCM. Choose another function.');
        reload();
      } else if (code === 'project-duplicate') {
        go(2);
        setError('That project name is already in use for this customer, product, and function.');
      } else if (code === 'invalid-project-draft') {
        go(2);
        setError('Check the project name and responsibility.');
      } else if (code === 'project-request-conflict') {
        setError('This submission may already be saved. Check your projects before creating it again.');
      } else if (code === 'forbidden') {
        setError('Your account can no longer create projects.');
      } else {
        setError('Couldn’t confirm the save. Check the same submission again to recover any saved project.');
      }
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  const input = step === 0 ? productInput : functionInput;
  const term = step === 0 ? productTerm : functionTerm;
  const setInput = step === 0 ? setProductInput : setFunctionInput;
  return <View style={styles.content}>
    <AccessRail labels={steps} index={step} />
    {error ? <FormMessage message={error} /> : null}
    <Phase key={step} shift={shift}>
      {step < 3 && result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading SCM catalog…</Text> : null}
      {step < 3 && result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' ? 'Your account can no longer create projects.' : 'Couldn’t load the SCM catalog.'} />
        {result.code !== 'forbidden' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {result.kind === 'ready' && step < 2 ? <>
        <SearchField label={step === 0 ? 'Find a customer or product' : 'Find a function'} value={input}
          placeholder={step === 0 ? 'Customer, suite, or tool' : 'Function name'} onChange={setInput} testID="project-catalog-search"
          onSubmit={() => search(input)} onClear={input || term ? () => { setInput(''); search(''); } : undefined} />
        {step === 0 ? <>
          {result.data.contexts.length ? <View style={styles.options}>
            {result.data.contexts.map((item) => <Option key={JSON.stringify(item)} title={item.customer} subtitle={item.suite + ' · ' + item.tool}
              onPress={() => { setContext(item); go(1); }} />)}
          </View> : <Text style={type.body}>{term ? 'No customer or product matches your search.' : 'Your account has no available customer and product combinations.'}</Text>}
          {result.data.moreContexts ? <Text style={type.caption}>Search by customer, suite, or tool to narrow the list.</Text> : null}
        </> : <>
          {result.data.functions.length ? <View style={styles.options}>
            {result.data.functions.map((item) => <Option key={item} title={item} onPress={() => { setFunctionName(item); go(2); }} />)}
          </View> : <Text style={type.body}>{term ? 'No functions match your search.' : 'SCM has no configured project functions.'}</Text>}
          {result.data.moreFunctions ? <Text style={type.caption}>Search by function to narrow the list.</Text> : null}
        </>}
      </> : null}
      {result.kind === 'ready' && step === 2 ? <>
        <Field label="Project name" value={name} onChangeText={setName} maxLength={120} autoCapitalize="sentences" testID="project-create-name" />
        <View style={styles.choices}>
          <Text accessibilityRole="header" style={styles.label}>Responsibility</Text>
          {result.data.responsibilities.map((item) => <Pressable key={item} accessibilityRole="radio"
            accessibilityState={{ checked: item === responsibility }} onPress={() => setResponsibility(item)}
            style={({ pressed }) => [styles.choice, item === responsibility && styles.active, pressed && styles.pressed]}>
            <Text style={[type.body, styles.copy]}>{item}</Text>
            {item === responsibility ? <Icon name="check" tint={color.blue} /> : null}
          </Pressable>)}
        </View>
        <Action label="Review project" testID="project-create-review" onPress={() => {
          if (!name.trim() || !responsibility) setError('Enter a project name and choose who’s responsible.');
          else go(3);
        }} />
      </> : null}
      {step === 3 && context ? <>
        <Text accessibilityRole="header" style={type.title}>{name.trim()}</Text>
        <DetailRecord rows={[
          ['Customer', context.customer], ['Product suite', context.suite], ['Product tool', context.tool],
          ['Function', functionName], ['Responsibility', responsibility],
        ]} />
        <Action label={busy ? 'Saving project…' : uncertain ? 'Check project save' : 'Create project'} icon="check" busy={busy}
          testID="project-create-submit" onPress={() => void save()} />
      </> : null}
      {step > 0 && !uncertain ? <TextAction label={'Back to ' + steps[step - 1].toLowerCase()} disabled={busy} onPress={() => go(step - 1)} /> : null}
      <TextAction label="Cancel" disabled={busy} onPress={close} />
    </Phase>
  </View>;
}

function Option({ title, subtitle, onPress }: { title: string; subtitle?: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
    <View style={styles.copy}>
      <Text style={styles.label}>{title}</Text>
      {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
    </View>
    <Icon name="arrow" size={16} tint={color.blue} />
  </Pressable>;
}

const styles = StyleSheet.create({
  content: { gap: 20, marginTop: 16 },
  options: { borderWidth: 1, borderColor: color.edge, borderRadius: 8, overflow: 'hidden', backgroundColor: color.panel },
  option: { minHeight: 60, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: color.edge },
  label: { color: color.text, fontSize: 16, fontWeight: '600' },
  copy: { flex: 1, gap: 4 },
  choices: { gap: 8 },
  choice: { minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: color.edge, borderRadius: 8, backgroundColor: color.panel },
  active: { backgroundColor: color.raised, borderColor: color.blue },
  pressed: { opacity: 0.76 },
});
