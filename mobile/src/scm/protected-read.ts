import { useEffect, useState } from 'react';
import { useFocusedForeground } from '../ui/motion';
import { AuthError, type Grant } from './auth-api';
import { useSession } from './session';

type Read<T> = (grant: Grant, signal: AbortSignal) => Promise<T>;
type ReadState<T> = { kind: 'loading' } | { kind: 'ready'; data: T } | { kind: 'error'; code?: AuthError['code'] };

export function useProtectedRead<T>(read: Read<T>) {
  const { state, expire } = useSession();
  const active = state.kind === 'active';
  const sessionToken = active ? state.grant.sessionToken : null;
  const expiresAt = active ? state.grant.expiresAt : 0;
  const focused = useFocusedForeground();
  const [revision, setRevision] = useState(0);
  const [settled, setSettled] = useState<{ read: Read<T>; token: string; revision: number; result: ReadState<T> } | null>(null);

  useEffect(() => {
    if (!sessionToken || !focused) return;
    const request = new AbortController();
    const finish = (result: ReadState<T>) => {
      if (!request.signal.aborted) setSettled({ read, token: sessionToken, revision, result });
    };
    void read({ sessionToken, expiresAt }, request.signal)
      .then((data) => finish({ kind: 'ready', data }))
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        const code = error instanceof AuthError ? error.code : undefined;
        if (code === 'expired') expire(sessionToken);
        else finish({ kind: 'error', code });
      });
    return () => request.abort();
  }, [expire, expiresAt, focused, read, revision, sessionToken]);

  const current = settled?.read === read && settled.token === sessionToken && settled.revision === revision;
  const result: ReadState<T> = current ? settled.result : { kind: 'loading' };
  return { result, reload: () => setRevision((current) => current + 1) };
}
