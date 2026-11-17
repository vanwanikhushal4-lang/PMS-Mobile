import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import { AuthError, restoreGrant, type Grant } from './auth-api';
import { authClient, authConfig } from './auth-config';
import type { AuthStep } from './auth-contract';

type Active = { grant: Grant; session: Extract<AuthStep, { kind: 'authenticated' }> };
type State = { kind: 'starting' | 'signed-out' } | ({ kind: 'active' } & Active);
const Session = createContext<{ state: State; accept: (active: Active) => void; expire: (sessionToken: string) => void; signOut: () => Promise<void> } | null>(null);
const key = 'scm.mobile.session.v1';
const vault = Platform.OS !== 'web' && authConfig?.fixture === false;

export function SessionProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<State>({ kind: 'starting' });
  const active = useRef<Active | null>(null);
  const storageQueue = useRef(Promise.resolve());
  const save = useCallback((value: Grant | null) => {
    if (!vault) return;
    storageQueue.current = storageQueue.current.then(async () => {
      if (value && authConfig) await SecureStore.setItemAsync(key, JSON.stringify({ endpoint: authConfig.url.href, ...value }), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      else await SecureStore.deleteItemAsync(key);
    }).catch(() => {});
  }, []);
  const clear = useCallback(() => {
    active.current = null;
    setState({ kind: 'signed-out' });
    save(null);
  }, [save]);
  const accept = useCallback((value: Active) => {
    const grant = { ...value.grant, expiresAt: value.session.expiresAt };
    const confirmed = { grant, session: value.session };
    active.current = confirmed;
    setState({ kind: 'active', ...confirmed });
    save(grant);
  }, [save]);
  const expire = useCallback((sessionToken: string) => {
    if (active.current?.grant.sessionToken === sessionToken) clear();
  }, [clear]);
  useEffect(() => {
    const controller = new AbortController();
    const bootstrap = async () => {
      try {
        if (!vault || !authConfig || !authClient) return;
        const stored = await SecureStore.getItemAsync(key);
        if (controller.signal.aborted) return;
        const grant = stored ? restoreGrant(stored, authConfig.url.href) : null;
        if (!grant) return;
        const session = await authClient.session(grant, controller.signal);
        if (!controller.signal.aborted) accept({ grant, session });
      } catch { /* A stored session is never trusted without server validation. */ }
      finally { if (!controller.signal.aborted && !active.current) clear(); }
    };
    void bootstrap();
    return () => controller.abort();
  }, [accept, clear]);
  useEffect(() => {
    if (state.kind !== 'active') return;
    const left = Math.max(0, state.session.expiresAt - Date.now());
    const timer = setTimeout(() => { if (active.current?.grant.sessionToken === state.grant.sessionToken) clear(); }, Math.min(left, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [clear, state]);
  useEffect(() => {
    let refresh: AbortController | undefined;
    const sub = AppState.addEventListener('change', (appState) => {
      if (appState === 'background') { refresh?.abort(); return; }
      if (appState !== 'active' || !active.current || !authClient) return;
      const current = active.current;
      if (current.session.expiresAt <= Date.now()) { clear(); return; }
      refresh?.abort();
      const request = new AbortController();
      refresh = request;
      void authClient.session(current.grant, request.signal).then((session) => {
        if (!request.signal.aborted && active.current === current) accept({ grant: current.grant, session });
      }).catch((error: unknown) => {
        if (!request.signal.aborted && active.current === current && error instanceof AuthError && error.code === 'expired') clear();
      });
    });
    return () => { refresh?.abort(); sub.remove(); };
  }, [accept, clear]);
  const signOut = useCallback(async () => {
    const grant = active.current?.grant;
    if (!grant || !authClient) { clear(); return; }
    try { await authClient.signOut(grant); }
    catch (error) { if (!(error instanceof AuthError && error.code === 'expired')) throw error; }
    if (active.current?.grant.sessionToken === grant.sessionToken) clear();
  }, [clear]);
  return <Session.Provider value={{ state, accept, expire, signOut }}>{children}</Session.Provider>;
}

export function useSession() {
  const value = useContext(Session);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
}
