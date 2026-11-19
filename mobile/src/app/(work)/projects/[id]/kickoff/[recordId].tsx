import { router, useLocalSearchParams } from 'expo-router';
import { getDocumentAsync, type DocumentPickerAsset } from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthError, submissionKey, type Grant } from '../../../../../scm/auth-api';
import { authClient } from '../../../../../scm/auth-config';
import { kickoffGroups, kickoffMaxFile, validKickoffFilename, validKickoffTime, type KickoffDraft, type KickoffGroup } from '../../../../../scm/kickoff-contract';
import { scheduleKickoff } from '../../../../../scm/kickoff-upload';
import { useProtectedRead } from '../../../../../scm/protected-read';
import { useSession } from '../../../../../scm/session';
import { Field, FormMessage, Phase, SearchField, TextAction } from '../../../../../ui/Access';
import { BrandedTopBar } from '../../../../../ui/Brand';
import { GlassLayer, useGlassControls } from '../../../../../ui/Glass';
import { Action, Screen, type } from '../../../../../ui/Primitives';
import { WorkspaceTabs } from '../../../../../ui/Workspace';
import { color } from '../../../../../ui/theme';
import { useReducedMotion } from '../../../../../ui/motion';

const meetingModes = ['Physical', 'Virtual'] as const;
const groupNames: Record<KickoffGroup, string> = { heads: 'Project heads', sales: 'Sales team', managers: 'Managers' };
const providerNames: Record<string, string> = { zoom: 'Zoom', teams: 'Microsoft Teams', webex: 'Cisco Webex', GMeet: 'Google Meet' };
type Pick = { id: number; name: string };

function routeId(value: unknown) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return 0;
  const id = Number(value);
  return id <= 2_147_483_647 ? id : 0;
}

function messageFor(error: unknown) {
  const code = error instanceof AuthError ? error.code : null;
  if (code === 'invalid-kickoff-file') return 'Choose a PDF, Office document, text file, image, or ZIP up to 10 MB.';
  if (code === 'invalid-kickoff') return 'Check the date, meeting details, and files.';
  if (code === 'kickoff-conflict') return 'This draft was already used. Check the project’s Records before scheduling again.';
  if (code === 'kickoff-participants-unavailable') return 'Some participants are no longer available. Review the selections.';
  if (code === 'forbidden' || code === 'not-found') return 'This approved document or its purchase order is unavailable for scheduling.';
  return 'Couldn’t confirm the kickoff. Retry this draft to check whether it saved.';
}

export default function KickoffScheduleScreen() {
  const params = useLocalSearchParams<{ id: string; recordId: string }>();
  const id = routeId(params.id), recordId = routeId(params.recordId);
  const { state, expire } = useSession();
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState<KickoffGroup>('heads');
  const [people, setPeople] = useState<Record<KickoffGroup, Pick[]>>({ heads: [], sales: [], managers: [] });
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mode, setMode] = useState(0);
  const [rooms, setRooms] = useState<string[]>([]);
  const [provider, setProvider] = useState('');
  const [link, setLink] = useState('');
  const [agenda, setAgenda] = useState<DocumentPickerAsset | null>(null);
  const [plan, setPlan] = useState<DocumentPickerAsset | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  const receipt = useRef({ signature: '', key: '' });
  useEffect(() => () => pending.current?.abort(), []);

  const read = useCallback((grant: Grant, signal: AbortSignal) => {
    if (!id || !recordId) return Promise.reject(new AuthError('not-found'));
    return authClient ? authClient.kickoffOptions(grant, { id, recordId }, term, signal) : Promise.reject(new AuthError('unavailable'));
  }, [id, recordId, term]);
  const { result, lastReady, reload } = useProtectedRead(read);
  const options = result.kind === 'ready' ? result.data : lastReady;

  function back() {
    if (router.canGoBack()) router.back();
    else if (id && recordId) router.replace({ pathname: '/projects/[id]/records/[scope]/[recordId]', params: { id, recordId, scope: 'understanding' } });
    else router.replace('/projects');
  }

  async function chooseFile(setFile: (file: DocumentPickerAsset | null) => void) {
    try {
      const selected = await getDocumentAsync({ copyToCacheDirectory: true, base64: false });
      if (selected.canceled) return;
      const file = selected.assets[0];
      if (!file || !validKickoffFilename(file.name) || (file.size !== undefined && (file.size < 1 || file.size > kickoffMaxFile))) {
        setError(messageFor(new AuthError('invalid-kickoff-file')));
        return;
      }
      setFile(file);
      setError('');
    } catch { setError('Couldn’t read the selected file. Try choosing it again.'); }
  }

  async function submit() {
    if (!options || pending.current || state.kind !== 'active') return;
    const stamp = `${date.trim()}T${time.trim()}`;
    if (!validKickoffTime(stamp)) { setError('Enter a valid date and time in the shown format.'); return; }
    if (kickoffGroups.some((key) => people[key].length === 0)) { setError('Select at least one participant from each group.'); return; }
    if (mode === 1 && (!provider || !link.trim())) { setError('Select a video platform and enter the meeting link or credentials.'); return; }
    if (!agenda) { setError('Choose the meeting agenda.'); return; }
    const base = { id, recordId, time: stamp, heads: people.heads.map(({ id }) => id), sales: people.sales.map(({ id }) => id), managers: people.managers.map(({ id }) => id) };
    const details = mode === 1 ? { mode: 'Virtual Mode' as const, provider, connection: link.trim() } : { mode: 'Physical Mode' as const, rooms };
    const signature = JSON.stringify([base, details, agenda.uri, plan?.uri]);
    if (receipt.current.signature !== signature) receipt.current = { signature, key: submissionKey() };
    const draft: KickoffDraft = { ...base, ...details, requestKey: receipt.current.key };
    const request = new AbortController();
    pending.current = request;
    const { grant } = state;
    setBusy(true);
    setError('');
    Keyboard.dismiss();
    try {
      const meetingId = await scheduleKickoff(grant, draft, agenda, plan, request.signal);
      if (!request.signal.aborted) router.replace({ pathname: '/projects/[id]/records/[scope]/[recordId]', params: { id, scope: 'kickoff', recordId: meetingId } });
    } catch (failure) {
      if (request.signal.aborted) return;
      if (failure instanceof AuthError && failure.code === 'expired') expire(grant.sessionToken);
      else setError(messageFor(failure));
    } finally {
      pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }

  return <Screen keyboard workspace>
    <BrandedTopBar><TextAction label="Understanding document" onPress={back} /></BrandedTopBar>
    <View style={styles.page}>
      <Text accessibilityRole="header" style={type.title}>Schedule kickoff</Text>
      {result.kind === 'error' ? <>
        <FormMessage message={result.code === 'forbidden' || result.code === 'not-found'
          ? 'This approved document or its purchase order is unavailable for scheduling.' : 'Couldn’t load the kickoff form.'} />
        {result.code !== 'forbidden' && result.code !== 'not-found' ? <TextAction label="Try again" onPress={reload} /> : null}
      </> : null}
      {!options && result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Loading kickoff details…</Text> : null}
      {options && result.kind !== 'error' ? <View style={styles.page}>
        <Text style={type.eyebrow}>{options.understanding} · {options.purchaseOrder}</Text>
        {options.kickoffStatus === 'Meeting Scheduled' ? <Text style={type.caption}>This purchase order already has a scheduled meeting.</Text> : null}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Meeting details</Text>
          <View style={styles.timeRow}>
            <View style={styles.field}><Field label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} maxLength={10} editable={!busy} testID="kickoff-date" /></View>
            <View style={styles.field}><Field label="Time" placeholder="HH:mm" value={time} onChangeText={setTime} maxLength={5} editable={!busy} testID="kickoff-time" /></View>
          </View>
          <Text style={type.caption}>Use {options.timeZone} time in 24-hour format.</Text>
          <WorkspaceTabs labels={meetingModes} index={mode} onSelect={(next) => { if (!busy) setMode(next); }} />
          <Phase key={mode} shift={12}><View style={styles.section}>
            <Text style={styles.label}>{mode === 0 ? 'Rooms' : 'Video platform'}</Text>
            <View style={styles.choices}>{(mode === 0 ? options.rooms : options.providers).map((option) => <Choice key={option}
              label={mode === 0 ? option : providerNames[option] ?? option} disabled={busy} selected={mode === 0 ? rooms.includes(option) : provider === option}
              onPress={() => mode === 0 ? setRooms((current) => current.includes(option) ? current.filter((room) => room !== option) : [...current, option])
                : setProvider(option)} />)}</View>
            {mode === 1 ? <Field label="Meeting link or credentials" value={link} onChangeText={setLink} maxLength={255}
              editable={!busy} multiline testID="kickoff-connection" /> : null}
          </View></Phase>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Participants</Text>
          <WorkspaceTabs labels={kickoffGroups.map((key) => groupNames[key])} index={kickoffGroups.indexOf(group)} onSelect={(next) => {
            if (!busy) setGroup(kickoffGroups[next]);
          }} />
          <SearchField label="Find participants" testID="kickoff-people-search" value={search} onChange={setSearch} placeholder="Name" onSubmit={() => { Keyboard.dismiss(); setTerm(search.trim()); }}
            onClear={search || term ? () => { setSearch(''); setTerm(''); } : undefined} />
          <Phase key={group + term} shift={8}><View style={styles.section}>
            {people[group].length ? <Text style={type.caption}>{people[group].length} selected</Text> : null}
            <View style={styles.choices}>{people[group].filter((person) => !options.roster[group].choices.some(({ id }) => id === person.id)).map((person) => <Choice key={person.id}
              label={`${person.name} · Remove`} selected disabled={busy} onPress={() => setPeople((current) => ({ ...current,
                [group]: current[group].filter(({ id }) => id !== person.id),
              }))} />)}</View>
            {result.kind === 'loading' ? <Text style={type.caption} accessibilityLiveRegion="polite">Finding participants…</Text> : null}
            {result.kind === 'ready' && !options.roster[group].choices.length ? <Text style={type.caption}>No matching participants.</Text> : null}
            <View style={styles.choices}>
              {options.roster[group].choices.map((person) => <Choice key={person.id} label={person.name} disabled={busy || result.kind !== 'ready'}
                testID={`kickoff-person-${person.id}`} selected={people[group].some(({ id }) => id === person.id)} onPress={() => setPeople((current) => ({
                  ...current, [group]: current[group].some(({ id }) => id === person.id)
                    ? current[group].filter(({ id }) => id !== person.id) : [...current[group], person],
                }))} />)}
            </View>
            {options.roster[group].hasMore ? <Text style={type.caption}>Search by name to find more people.</Text> : null}
          </View></Phase>
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.heading}>Files</Text>
          <TextAction label={agenda ? 'Replace agenda' : 'Choose agenda'} material="glass" disabled={busy} testID="kickoff-agenda" onPress={() => void chooseFile(setAgenda)} />
          {agenda ? <Text style={type.body}>{agenda.name}</Text> : null}
          <TextAction label={plan ? 'Replace plan of action' : 'Choose plan of action (optional)'} material="glass" disabled={busy} testID="kickoff-plan" onPress={() => void chooseFile(setPlan)} />
          {plan ? <><Text style={type.body}>{plan.name}</Text><TextAction label="Remove plan" disabled={busy} onPress={() => setPlan(null)} /></> : null}
        </View>
        {error ? <FormMessage message={error} /> : null}
        <Action label={busy ? 'Saving kickoff…' : 'Schedule kickoff'} icon="check" busy={busy} testID="submit-kickoff" onPress={() => void submit()} />
      </View> : null}
    </View>
  </Screen>;
}

function Choice({ label, selected, disabled, testID, onPress }: {
  label: string; selected: boolean; disabled: boolean; testID?: string; onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const glass = useGlassControls() && selected;
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduced || disabled) { scale.stopAnimation(); scale.setValue(1); }
    return () => scale.stopAnimation();
  }, [disabled, reduced, scale]);
  const press = (toValue: number) => {
    if (!reduced) Animated.timing(scale, { toValue, duration: toValue < 1 ? 100 : 220,
      easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  return <Animated.View style={{ transform: [{ scale: reduced ? 1 : scale }] }}><Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} testID={testID} onPress={onPress}
    onPressIn={() => press(0.96)} onPressOut={() => press(1)}
    style={({ pressed }) => [styles.choice, selected && styles.selected, glass && styles.glassChoice, pressed && !glass && styles.pressed]}>
    {glass ? <GlassLayer radius={22} accent /> : null}
    <Text style={selected ? styles.selection : styles.label}>{label}</Text>
  </Pressable></Animated.View>;
}

const styles = StyleSheet.create({
  page: { gap: 24 },
  section: { gap: 12 },
  heading: { color: color.text, fontSize: 18, lineHeight: 24, fontWeight: '600' },
  timeRow: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: color.edge, paddingHorizontal: 12, backgroundColor: color.panel },
  selected: { borderColor: color.blue, backgroundColor: color.raised },
  glassChoice: { borderColor: 'transparent', backgroundColor: 'transparent', borderRadius: 22 },
  pressed: { backgroundColor: color.raised },
  label: { color: color.text, fontSize: 14, fontWeight: '500' },
  selection: { color: color.blue, fontSize: 14, fontWeight: '600' },
});
