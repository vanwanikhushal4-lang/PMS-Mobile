import { decodeAuthStep, type AuthStep } from './auth-contract.ts';
import { decodeWorkspace } from './workspace-contract.ts';
import { decodeProfile, decodeProject, decodeProjectRecords, decodeProjects } from './projects-contract.ts';
import { decodeAssignedTasks, decodeWorkLog } from './tasks-contract.ts';

export type AuthConfig = { url: URL; fixture: boolean };
export type Grant = { sessionToken: string; expiresAt: number };
type AuthResult = Exclude<AuthStep, { kind: 'authenticated' }> | { kind: 'authenticated'; grant: Grant; session: Extract<AuthStep, { kind: 'authenticated' }> };
export type RecoveryResult =
  | { kind: 'recovery-sent'; challengeId: string; expiresAt: number }
  | { kind: 'recovery-verified'; resetGrant: string; expiresAt: number }
  | { kind: 'password-changed' }
  | Extract<AuthStep, { kind: 'rejected' }>;

const opaque = /^[A-Za-z0-9_-]{22,256}$/;
const local = new Set(['127.0.0.1', 'localhost', '10.0.2.2', '[::1]']);

export function resolveAuthConfig(value: string | undefined, allowFixture = false): AuthConfig | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null;
    const fixture = allowFixture && url.protocol === 'http:' && local.has(url.hostname);
    if (url.protocol !== 'https:' && !fixture) return null;
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    if (!url.pathname.endsWith('/mobile/v1/auth/')) return null;
    return { url, fixture };
  } catch { return null; }
}

export class AuthError extends Error {
  readonly code: 'transport' | 'bad-response' | 'expired' | 'unavailable' | 'forbidden' | 'not-found';
  constructor(code: AuthError['code']) { super(code); this.name = 'AuthError'; this.code = code; }
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new AuthError('bad-response');
  return value as Record<string, unknown>;
}

function decodeResult(value: unknown): AuthResult {
  const step = decodeAuthStep(value);
  if (!step) throw new AuthError('bad-response');
  if (step.kind !== 'authenticated') return step;
  const token = jsonObject(value).sessionToken;
  if (typeof token !== 'string' || !opaque.test(token)) throw new AuthError('bad-response');
  return { kind: 'authenticated', session: step, grant: { sessionToken: token, expiresAt: step.expiresAt } };
}

function decodeRecovery(value: unknown): RecoveryResult {
  const item = jsonObject(value);
  if (item.kind === 'password-changed') return { kind: item.kind };
  const rejected = decodeAuthStep(value);
  if (rejected?.kind === 'rejected') return rejected;
  const expiresAt = item.expiresAt;
  const now = Date.now();
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt - now > 15 * 60_000) throw new AuthError('bad-response');
  if (item.kind === 'recovery-sent' && typeof item.challengeId === 'string' && opaque.test(item.challengeId)) return { kind: item.kind, challengeId: item.challengeId, expiresAt };
  if (item.kind === 'recovery-verified' && typeof item.resetGrant === 'string' && opaque.test(item.resetGrant)) return { kind: item.kind, resetGrant: item.resetGrant, expiresAt };
  throw new AuthError('bad-response');
}

export function restoreGrant(value: string, endpoint: string, now = Date.now()): Grant | null {
  try {
    const record = jsonObject(JSON.parse(value));
    if (record.endpoint !== endpoint || typeof record.sessionToken !== 'string' || !opaque.test(record.sessionToken)
        || typeof record.expiresAt !== 'number' || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= now) return null;
    return { sessionToken: record.sessionToken, expiresAt: record.expiresAt };
  } catch { return null; }
}

type Requester = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'url' | 'headers' | 'json'>>;
export function createAuthClient(config: AuthConfig, send: Requester = fetch, timeoutMs = 9000) {
  async function request(path: string, body: object | undefined, signal?: AbortSignal, token?: string) {
    const url = new URL(path, config.url);
    const missingReason = path === 'projects/detail' || path === 'projects/records' ? 'project-not-found'
      : path === 'tasks/work-log' ? 'task-not-found' : null;
    const abort = new AbortController();
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const response = await send(url.href, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit',
        signal: abort.signal, headers: {
          Accept: 'application/json', 'Cache-Control': 'no-store',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
        }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (response.url !== url.href) throw new AuthError('bad-response');
      if (token && response.status === 401) throw new AuthError('expired');
      if (response.status >= 500 || (response.status === 404 && !missingReason)) throw new AuthError('unavailable');
      if (response.status === 403 && (path.startsWith('projects/') || path.startsWith('tasks/'))) throw new AuthError('forbidden');
      if (path === 'sign-out') {
        if (response.status !== 204) throw new AuthError('bad-response');
        return null;
      }
      if (response.status === 429) return { kind: 'rejected', reason: 'rate-limited' };
      if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AuthError('bad-response');
      const data = await response.json().catch(() => { throw new AuthError('bad-response'); });
      if (missingReason && response.status === 404 && jsonObject(data).reason === missingReason) {
        throw new AuthError('not-found');
      }
      if (!response.ok && jsonObject(data).kind !== 'rejected') throw new AuthError('bad-response');
      return data;
    } catch (error) {
      throw error instanceof AuthError ? error : new AuthError('transport');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return {
    signIn: async (details: { companyCode: string; username: string; password: string }, signal?: AbortSignal) => decodeResult(await request('sign-in', details, signal)),
    verify: async (challengeId: string, code: string, signal?: AbortSignal) => decodeResult(await request('challenge/verify', { challengeId, code }, signal)),
    resend: async (challengeId: string, signal?: AbortSignal) => decodeResult(await request('challenge/resend', { challengeId }, signal)),
    session: async (grant: Grant, signal?: AbortSignal) => {
      const step = decodeAuthStep(await request('session', undefined, signal, grant.sessionToken));
      if (step?.kind !== 'authenticated') throw new AuthError('bad-response');
      return step;
    },
    workspace: async (grant: Grant, signal?: AbortSignal) => {
      const data = decodeWorkspace(await request('workspace', undefined, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    profile: async (grant: Grant, signal?: AbortSignal) => {
      const data = decodeProfile(await request('profile', undefined, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    projects: async (grant: Grant, filter: { query?: string; before?: number }, signal?: AbortSignal) => {
      const data = decodeProjects(await request('projects/list', filter, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    project: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodeProject(await request('projects/detail', { id }, signal, grant.sessionToken));
      if (!data || data.id !== id) throw new AuthError('bad-response');
      return data;
    },
    projectRecords: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodeProjectRecords(await request('projects/records', { id }, signal, grant.sessionToken));
      if (!data || data.projectId !== id) throw new AuthError('bad-response');
      return data;
    },
    assignedTasks: async (grant: Grant, before?: number, signal?: AbortSignal) => {
      const data = decodeAssignedTasks(await request('tasks/assigned-by-me', { before }, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    myTasks: async (grant: Grant, before?: number, signal?: AbortSignal) => {
      const data = decodeAssignedTasks(await request('tasks/assigned-to-me', { before }, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    workLog: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodeWorkLog(await request('tasks/work-log', { id }, signal, grant.sessionToken));
      if (!data || data.taskId !== id) throw new AuthError('bad-response');
      return data;
    },
    signOut: async (grant: Grant, signal?: AbortSignal) => { await request('sign-out', {}, signal, grant.sessionToken); },
    startRecovery: async (details: { companyCode: string; username: string; channel: 'email' | 'sms' }, signal?: AbortSignal) => decodeRecovery(await request('recovery/start', details, signal)),
    verifyRecovery: async (challengeId: string, code: string, signal?: AbortSignal) => decodeRecovery(await request('recovery/verify', { challengeId, code }, signal)),
    completeRecovery: async (resetGrant: string, password: string, signal?: AbortSignal) => decodeRecovery(await request('recovery/complete', { resetGrant, password }, signal)),
  };
}
