import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, StyleSheet, Text, View } from 'react-native';
import { AuthError } from '../scm/auth-api';
import { authClient, authConfig } from '../scm/auth-config';
import type { AuthStep } from '../scm/auth-contract';
import { useSession } from '../scm/session';
import { AccessRail, Field, FormMessage, Phase, TextAction } from '../ui/Access';
import { BrandedTopBar } from '../ui/Brand';
import { Action, Icon, Screen, type } from '../ui/Primitives';
import { SetupCode } from '../ui/SetupCode';
import { useArrival } from '../ui/motion';
import { color } from '../ui/theme';

type Pending = Extract<AuthStep, { kind: 'challenge' | 'enrollment' }>;
type Stage = { kind: 'account' } | { kind: 'recover' } | { kind: 'reset-done' }
  | { kind: 'mfa'; pending: Pending } | { kind: 'recover-code'; id: string; expiresAt: number }
  | { kind: 'reset'; grant: string; expiresAt: number };

function failure(reason: Extract<AuthStep, { kind: 'rejected' }>['reason']) {
  switch (reason) {
    case 'invalid-credentials': return 'Check your company code, username and password';
    case 'invalid-code': return 'That code didn’t match. Check the code and try again';
    case 'expired': return 'This request expired. Start again';
    case 'rate-limited': return 'Too many attempts. Wait a moment before trying again';
    case 'account-unavailable': return 'This account can’t sign in right now. Contact your SCM administrator';
    case 'password-policy': return 'Use at least 12 characters for your new password';
  }
}

export default function SignInScreen() {
  const router = useRouter();
  const { accept } = useSession();
  const [stage, setStage] = useState<Stage>({ kind: 'account' });
  const [companyCode, setCompany] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const flight = useRef<AbortController | null>(null);
  const arrival = useArrival(0, 12);

  const move = (value: Stage) => {
    Keyboard.dismiss(); setCode(''); setPassword(''); setConfirm(''); setMessage(''); setStage(value);
  };
  useFocusEffect(useCallback(() => () => {
    const request = flight.current;
    flight.current = null;
    request?.abort();
    setCode(''); setPassword(''); setConfirm(''); setMessage(''); setBusy(false); setStage({ kind: 'account' });
  }, []));
  useEffect(() => {
    const deadline = stage.kind === 'mfa' ? stage.pending.expiresAt : 'expiresAt' in stage ? stage.expiresAt : 0;
    if (!deadline) return;
    const timer = setTimeout(() => {
      const request = flight.current;
      flight.current = null;
      request?.abort(); setBusy(false); setCode(''); setPassword(''); setConfirm('');
      setStage({ kind: stage.kind === 'mfa' ? 'account' : 'recover' }); setMessage(failure('expired'));
    }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [stage]);

  async function run(operation: (signal: AbortSignal) => Promise<void>) {
    if (flight.current) return;
    const request = new AbortController();
    flight.current = request;
    setBusy(true); setMessage('');
    try { await operation(request.signal); }
    catch (error) {
      if (request.signal.aborted) return;
      setMessage(error instanceof AuthError && error.code === 'unavailable'
        ? 'The SCM sign-in service is unavailable right now'
        : 'Couldn’t confirm the request. Check your connection and try again');
    } finally {
      if (flight.current === request) { flight.current = null; setBusy(false); }
    }
  }

  function submit() {
    const client = authClient;
    if (!client) return;
    const account = { companyCode: companyCode.trim(), username: username.trim() };
    if ((stage.kind === 'account' || stage.kind === 'recover') && (!account.companyCode || !account.username || (stage.kind === 'account' && !password))) {
      setMessage(stage.kind === 'account' ? 'Enter your company code, username and password' : 'Enter your company code and username'); return;
    }
    if ((stage.kind === 'mfa' || stage.kind === 'recover-code') && !/^\d{6}$/.test(code)) { setMessage('Enter the six-digit code'); return; }
    if (stage.kind === 'reset' && password.length < 12) { setMessage(failure('password-policy')); return; }
    if (stage.kind === 'reset' && password !== confirm) { setMessage('Enter the same new password twice'); return; }
    Keyboard.dismiss();
    void run(async (signal) => {
      if (stage.kind === 'account' || stage.kind === 'mfa') {
        const result = stage.kind === 'account' ? await client.signIn({ ...account, password }, signal) : await client.verify(stage.pending.challengeId, code, signal);
        if (signal.aborted) return;
        if (result.kind === 'rejected') { if (result.reason === 'expired') move({ kind: 'account' }); setMessage(failure(result.reason)); return; }
        if (result.kind === 'authenticated') { setPassword(''); setCode(''); accept(result); return; }
        move({ kind: 'mfa', pending: result }); return;
      }
      if (stage.kind === 'reset-done') return;
      const result = stage.kind === 'recover' ? await client.startRecovery({ ...account, channel }, signal)
        : stage.kind === 'recover-code' ? await client.verifyRecovery(stage.id, code, signal)
        : 'grant' in stage ? await client.completeRecovery(stage.grant, password, signal) : null;
      if (signal.aborted || !result) return;
      if (result.kind === 'rejected') { if (result.reason === 'expired') move({ kind: 'recover' }); setMessage(failure(result.reason)); }
      else if (stage.kind === 'recover' && result.kind === 'recovery-sent') move({ kind: 'recover-code', id: result.challengeId, expiresAt: result.expiresAt });
      else if (stage.kind === 'recover-code' && result.kind === 'recovery-verified') move({ kind: 'reset', grant: result.resetGrant, expiresAt: result.expiresAt });
      else if (stage.kind === 'reset' && result.kind === 'password-changed') move({ kind: 'reset-done' });
      else throw new AuthError('bad-response');
    });
  }

  function resend() {
    const client = authClient;
    if (!client || stage.kind !== 'mfa' || stage.pending.kind !== 'challenge' || !stage.pending.canResend) return;
    void run(async (signal) => {
      const result = await client.resend(stage.pending.challengeId, signal);
      if (signal.aborted) return;
      if (result.kind === 'rejected') { if (result.reason === 'expired') move({ kind: 'account' }); setMessage(failure(result.reason)); }
      else if (result.kind === 'challenge' && result.method === 'sms') move({ kind: 'mfa', pending: result });
      else throw new AuthError('bad-response');
    });
  }

  const recovery = stage.kind !== 'account' && stage.kind !== 'mfa';
  const stageIndex = stage.kind === 'mfa' || stage.kind === 'recover-code' ? 1 : stage.kind === 'reset' || stage.kind === 'reset-done' ? 2 : 0;
  const title = {
    account: 'Sign in to SCM', mfa: stage.kind === 'mfa' && stage.pending.kind === 'enrollment' ? 'Set up your authenticator' : 'Verify your sign-in',
    recover: 'Recover your account', 'recover-code': 'Enter your recovery code', reset: 'Set a new password', 'reset-done': 'Password updated',
  }[stage.kind];
  let hint = 'Use the company code and credentials you use for SCM';
  if (stage.kind === 'mfa') {
    hint = stage.pending.kind === 'enrollment' ? 'Scan the code or enter the setup key in your authenticator, then verify with the code it generates'
      : stage.pending.method === 'sms' ? `Enter the code sent by text${stage.pending.maskedDestination ? ` to ${stage.pending.maskedDestination}` : ''}`
      : 'Enter the current code from your authenticator app';
  } else if (stage.kind === 'recover') hint = 'Choose where to receive a recovery code';
  else if (stage.kind === 'recover-code') hint = `If the account supports ${channel === 'sms' ? 'text recovery' : 'email recovery'}, a code was sent`;
  else if (stage.kind === 'reset') hint = 'Choose a new password with at least 12 characters';
  else if (stage.kind === 'reset-done') hint = 'Sign in again with your new password';
  const action = { account: 'Continue', mfa: 'Verify code', recover: 'Send recovery code', 'recover-code': 'Verify code', reset: 'Change password', 'reset-done': 'Back to sign in' }[stage.kind];

  return <Screen keyboard>
    <Animated.View style={[styles.head, arrival]}>
      <BrandedTopBar>
        <TextAction label="Back to SCM Mobile" testID="auth-back" onPress={() => router.replace('/')} />
      </BrandedTopBar>
      {authConfig?.fixture && <View style={styles.environment}><Icon name="lock" /><Text style={type.caption}>Local test server · Use a test account</Text></View>}
      {authClient && <AccessRail labels={recovery ? ['Account', 'Recovery code', 'New password'] : ['Account', 'Verification']} index={stageIndex} />}
    </Animated.View>
    {authClient ? <Phase key={stage.kind}>
      <View style={styles.heading}><Text accessibilityRole="header" style={type.title}>{title}</Text><Text style={type.body}>{hint}</Text></View>
      {(stage.kind === 'account' || stage.kind === 'recover') && <View style={styles.group}>
        <Field label="Company code" testID="auth-company" value={companyCode} onChangeText={setCompany} editable={!busy} maxLength={48} />
        <Field label="Username" testID="auth-username" value={username} onChangeText={setUsername} editable={!busy} autoComplete="username" maxLength={128} />
        {stage.kind === 'account' && <Field label="Password" testID="auth-password" value={password} onChangeText={setPassword} editable={!busy} autoComplete="current-password" secret maxLength={512} onSubmitEditing={submit} />}
      </View>}
      {stage.kind === 'recover' && <View style={styles.channel} accessibilityRole="radiogroup">
        {(['email', 'sms'] as const).map((option) => <Text key={option} accessibilityRole="radio" accessibilityState={{ checked: channel === option, disabled: busy }}
          onPress={busy ? undefined : () => setChannel(option)} style={[styles.option, channel === option && styles.selected]}>{option === 'email' ? 'Email' : 'Text message'}</Text>)}
      </View>}
      {stage.kind === 'mfa' && stage.pending.kind === 'enrollment' && <SetupCode uri={stage.pending.setupUri} />}
      {(stage.kind === 'mfa' || stage.kind === 'recover-code') && <Field label="Six-digit code" testID="auth-code" value={code} maxLength={6}
        onChangeText={(value) => setCode(value.replace(/\D/g, ''))} editable={!busy} keyboardType="number-pad" autoComplete="one-time-code" onSubmitEditing={submit} />}
      {stage.kind === 'reset' && <View style={styles.group}>
        <Field label="New password" testID="auth-new-password" value={password} onChangeText={setPassword} editable={!busy} autoComplete="new-password" secret maxLength={512} />
        <Field label="Confirm password" testID="auth-confirm-password" value={confirm} onChangeText={setConfirm} editable={!busy} autoComplete="new-password" secret maxLength={512} onSubmitEditing={submit} />
      </View>}
      {message ? <FormMessage message={message} /> : null}
      <Action label={busy ? 'Please wait…' : action} testID="auth-submit" busy={busy} onPress={stage.kind === 'reset-done' ? () => move({ kind: 'account' }) : submit} />
      {stage.kind === 'account' && <TextAction label="Forgot your password?" testID="auth-recover" disabled={busy} onPress={() => move({ kind: 'recover' })} />}
      {stage.kind !== 'account' && stage.kind !== 'reset-done' && <View style={styles.links}>
        {stage.kind === 'mfa' && stage.pending.kind === 'challenge' && stage.pending.canResend && <TextAction label="Send another code" testID="auth-resend" disabled={busy} onPress={resend} />}
        <TextAction label="Start over" testID="auth-start-over" disabled={busy} onPress={() => move({ kind: 'account' })} />
      </View>}
    </Phase> : <Phase>
      <Text accessibilityRole="header" style={type.title}>Sign-in service not configured</Text>
      <Text style={type.body}>Contact your SCM administrator for a build connected to your company’s mobile sign-in service</Text>
      <Action label="Check server connection" onPress={() => router.navigate('/connection')} secondary />
    </Phase>}
  </Screen>;
}

const styles = StyleSheet.create({
  head: { gap: 24, marginBottom: 32 }, environment: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { gap: 8 }, group: { gap: 16 }, links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24 },
  channel: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  option: { paddingVertical: 12, paddingHorizontal: 12, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: color.edge, color: color.muted, fontSize: 14 },
  selected: { borderColor: color.blue, backgroundColor: color.panel, color: color.text },
});
