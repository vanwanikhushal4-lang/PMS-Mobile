import { decodeAuthStep, type AuthStep } from './auth-contract.ts';
import { decodeAttachments, type AttachmentTarget } from './attachments-contract.ts';
import { decodeWorkspace } from './workspace-contract.ts';
import { decodeCreatedProject, decodeDocumentReviewQueue, decodeProfile, decodeProject, decodeProjectCreateOptions,
  decodeProjectRecordDetail, decodeProjectRecords, decodeProjects, type DocumentReviewDecision, type DocumentReviewScope,
  type ProjectDraft, type ProjectRecordTarget } from './projects-contract.ts';
import { decodePublishTree, decodePurchaseOrder, decodePurchaseOrders, type PublishCustomer, type PublishPath } from './publishing-contract.ts';
import { decodeAssignedTasks, decodeTaskAssignees, decodeTaskContexts, decodeTaskDates, decodeWorkLog,
  type DateApproval, type DateProposal, type DateQueue, type StandaloneTask, type TaskContext, type TaskDraft, type TaskTransfer } from './tasks-contract.ts';

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
  readonly code: 'transport' | 'bad-response' | 'expired' | 'unavailable' | 'forbidden' | 'not-found' | 'progress-already-logged' | 'task-closed'
    | 'date-range' | 'date-reason-length' | 'date-change-conflict' | 'date-no-reviewer'
    | 'invalid-task-draft' | 'task-weight-limit' | 'task-assignment-conflict' | 'candidate-unavailable'
    | 'invalid-project-draft' | 'project-context-unavailable' | 'project-function-unavailable' | 'project-request-conflict' | 'project-duplicate'
    | 'project-review-conflict';
  readonly taskId?: number;
  constructor(code: AuthError['code'], taskId?: number) { super(code); this.name = 'AuthError'; this.code = code; this.taskId = taskId; }
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
function validTaskId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function submissionKey() {
  const nonce = () => Math.random().toString(36).slice(2).padEnd(11, '0');
  return [Date.now().toString(36), nonce(), nonce()].join('-');
}

function confirmedBatch(result: unknown, kind: string, items: readonly { id: number }[]) {
  const data = jsonObject(result);
  const expected = items.map((item) => item.id).sort((a, b) => a - b);
  const ids = data.taskIds;
  if (data.kind !== kind || !Array.isArray(ids) || ids.length !== expected.length
      || expected.some((id, index) => ids[index] !== id)) throw new AuthError('bad-response');
}

export function createAuthClient(config: AuthConfig, send: Requester = fetch, timeoutMs = 9000) {
  async function request(path: string, body: object | undefined, signal?: AbortSignal, token?: string) {
    const url = new URL(path, config.url);
    const missingReason = ['projects/detail', 'projects/records', 'projects/records/detail', 'projects/records/review', 'projects/tasks', 'projects/favorite',
      'tasks/assignments/project-options', 'tasks/assignments/create'].includes(path) ? 'project-not-found'
      : ['tasks/work-log', 'tasks/progress', 'tasks/complete', 'tasks/dates/detail', 'tasks/dates/request', 'tasks/dates/approve',
        'tasks/dates/request-batch', 'tasks/dates/approve-batch',
        'tasks/assignments/options', 'tasks/assignments/reassign', 'tasks/assignments/reassign-bulk'].includes(path) ? 'task-not-found'
        : path.startsWith('tasks/assignments/standalone-') ? 'context-not-found'
          : path === 'projects/attachments/list' ? 'attachment-not-found'
          : path.startsWith('projects/publishing/') ? 'publishing-not-found' : null;
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
      if (path === 'projects/records/review' && response.status === 409) {
        const { kind, reason } = jsonObject(data);
        if (kind === 'rejected' && reason === 'project-review-conflict') throw new AuthError(reason);
      }
      if (path === 'projects/create' && (response.status === 400 || response.status === 409)) {
        const { kind, reason } = jsonObject(data);
        if (kind === 'rejected' && (reason === 'invalid-project-draft' || reason === 'project-context-unavailable'
          || reason === 'project-function-unavailable' || reason === 'project-request-conflict' || reason === 'project-duplicate')) {
          throw new AuthError(reason);
        }
      }
      if (path === 'tasks/progress' && response.status === 409) {
        const { kind, reason } = jsonObject(data);
        if (kind === 'rejected' && (reason === 'progress-already-logged' || reason === 'task-closed')) throw new AuthError(reason);
      }
      if (path.startsWith('tasks/dates/') && (response.status === 409 || response.status === 400)) {
        const { kind, reason, taskId } = jsonObject(data);
        if (kind === 'rejected' && (((reason === 'date-range' || reason === 'date-reason-length') && response.status === 400)
            || ((reason === 'date-change-conflict' || reason === 'date-no-reviewer') && response.status === 409))) {
          throw new AuthError(reason, validTaskId(taskId) ? taskId : undefined);
        }
      }
      if (path.startsWith('tasks/assignments/') && (response.status === 400 || response.status === 409)) {
        const { kind, reason, taskId } = jsonObject(data);
        if (kind === 'rejected' && (reason === 'invalid-task-draft' || reason === 'task-weight-limit'
            || reason === 'task-assignment-conflict' || reason === 'candidate-unavailable')) {
          throw new AuthError(reason, validTaskId(taskId) ? taskId : undefined);
        }
      }
      if (missingReason && response.status === 404 && jsonObject(data).reason === missingReason) {
        const { taskId } = jsonObject(data);
        throw new AuthError('not-found', validTaskId(taskId) ? taskId : undefined);
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
    projects: async (grant: Grant, filter: { query?: string; before?: number; saved?: boolean }, signal?: AbortSignal) => {
      const data = decodeProjects(await request('projects/list', filter, signal, grant.sessionToken));
      if (!data || (filter.saved && data.items.some((project) => !project.favorite))) throw new AuthError('bad-response');
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
    projectRecordDetail: async (grant: Grant, target: ProjectRecordTarget, signal?: AbortSignal) => {
      const data = decodeProjectRecordDetail(await request('projects/records/detail', target, signal, grant.sessionToken), target);
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    documentReviewQueue: async (grant: Grant, scope: DocumentReviewScope, before?: number, signal?: AbortSignal) => {
      const data = decodeDocumentReviewQueue(await request('projects/records/review-queue', { scope, before }, signal, grant.sessionToken), scope, before);
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    reviewProjectRecord: async (grant: Grant, target: ProjectRecordTarget, decision: DocumentReviewDecision, signal?: AbortSignal) => {
      const data = decodeProjectRecordDetail(await request('projects/records/review', { ...target, ...decision }, signal, grant.sessionToken), target);
      const status = target.scope === 'requirement' ? 'RD Approved' : decision.decision === 'approve' ? 'UD Approved By MD' : 'UD Rejected By MD';
      if (!data || data.review || data.item.status !== status) throw new AuthError('bad-response');
      return data;
    },
    projectTasks: async (grant: Grant, id: number, { query, before }: { query?: string; before?: number }, signal?: AbortSignal) => {
      const response = await request('projects/tasks', { id, query, before }, signal, grant.sessionToken);
      const data = decodeAssignedTasks(response);
      if (!data || jsonObject(response).projectId !== id || (before !== undefined
        && data.items.some((task) => task.id >= before))) throw new AuthError('bad-response');
      return data;
    },
    setProjectFavorite: async (grant: Grant, id: number, favorite: boolean, signal?: AbortSignal) => {
      const response = jsonObject(await request('projects/favorite', { id, favorite }, signal, grant.sessionToken));
      if (response.kind !== 'project-favorite' || response.projectId !== id || response.favorite !== favorite) throw new AuthError('bad-response');
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
    completedTasks: async (grant: Grant, before?: number, signal?: AbortSignal) => {
      const data = decodeAssignedTasks(await request('tasks/completed', { before }, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    workLog: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodeWorkLog(await request('tasks/work-log', { id }, signal, grant.sessionToken));
      if (!data || data.taskId !== id) throw new AuthError('bad-response');
      return data;
    },
    logProgress: async (grant: Grant, id: number, note: string, signal?: AbortSignal) => {
      const data = jsonObject(await request('tasks/progress', { id, note }, signal, grant.sessionToken));
      if (data.kind !== 'task-progress-saved' || data.taskId !== id) throw new AuthError('bad-response');
    },
    completeTask: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = jsonObject(await request('tasks/complete', { id }, signal, grant.sessionToken));
      if (data.kind !== 'task-completed' || data.taskId !== id) throw new AuthError('bad-response');
    },
    dateQueue: async (grant: Grant, queue: DateQueue, before?: number, signal?: AbortSignal) => {
      const data = decodeAssignedTasks(await request('tasks/dates/list', { queue, before }, signal, grant.sessionToken));
      if (!data || (before !== undefined && data.items.some((task) => task.id >= before))) throw new AuthError('bad-response');
      return data;
    },
    taskDates: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodeTaskDates(await request('tasks/dates/detail', { id }, signal, grant.sessionToken));
      if (!data || data.taskId !== id) throw new AuthError('bad-response');
      return data;
    },
    requestTaskDates: async (grant: Grant, id: number, { start, due, reason }: { start?: string; due: string; reason: string }, signal?: AbortSignal) => {
      const data = jsonObject(await request('tasks/dates/request', { id, start, due, reason }, signal, grant.sessionToken));
      if (data.kind !== 'task-dates-requested' || data.taskId !== id) throw new AuthError('bad-response');
    },
    approveTaskDates: async (grant: Grant, id: number, revision: string, signal?: AbortSignal) => {
      const data = jsonObject(await request('tasks/dates/approve', { id, revision }, signal, grant.sessionToken));
      if (data.kind !== 'task-dates-approved' || data.taskId !== id) throw new AuthError('bad-response');
    },
    requestTaskDatesBatch: async (grant: Grant, items: readonly DateProposal[], signal?: AbortSignal) => {
      const data = await request('tasks/dates/request-batch', { items }, signal, grant.sessionToken);
      confirmedBatch(data, 'task-date-batch-requested', items);
    },
    approveTaskDatesBatch: async (grant: Grant, items: readonly DateApproval[], signal?: AbortSignal) => {
      const data = await request('tasks/dates/approve-batch', { items }, signal, grant.sessionToken);
      confirmedBatch(data, 'task-date-batch-approved', items);
    },
    assignmentQueue: async (grant: Grant, before?: number, signal?: AbortSignal) => {
      const data = decodeAssignedTasks(await request('tasks/assignments/list', { before }, signal, grant.sessionToken));
      if (!data || (before !== undefined && data.items.some((task) => task.id >= before))) throw new AuthError('bad-response');
      return data;
    },
    assignees: async (grant: Grant, id: number, project: boolean, query?: string, signal?: AbortSignal) => {
      const path = project ? 'tasks/assignments/project-options' : 'tasks/assignments/options';
      const data = decodeTaskAssignees(await request(path, { id, query }, signal, grant.sessionToken));
      if (!data || data.id !== id || (data.revision === null) !== project) throw new AuthError('bad-response');
      return data;
    },
    taskContexts: async (grant: Grant, query?: string, signal?: AbortSignal) => {
      const data = decodeTaskContexts(await request('tasks/assignments/contexts', { query }, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    standaloneAssignees: async (grant: Grant, context: TaskContext, query?: string, signal?: AbortSignal) => {
      const data = decodeTaskAssignees(await request('tasks/assignments/standalone-options', { context, query }, signal, grant.sessionToken));
      if (!data || data.id !== null || data.revision !== null || data.context?.customer !== context.customer
          || data.context.suite !== context.suite || data.context.tool !== context.tool) throw new AuthError('bad-response');
      return data;
    },
    createTask: async (grant: Grant, target: number | StandaloneTask, draft: TaskDraft, signal?: AbortSignal) => {
      const project = typeof target === 'number';
      const path = project ? 'tasks/assignments/create' : 'tasks/assignments/standalone-create';
      const data = jsonObject(await request(path, { ...draft, ...(project ? { id: target } : target) }, signal, grant.sessionToken));
      const { taskId } = data;
      if (data.kind !== 'task-created' || data.projectId !== (project ? target : null) || !validTaskId(taskId)) throw new AuthError('bad-response');
      return taskId;
    },
    reassignTask: async (grant: Grant, id: number, revision: string, candidate: string, signal?: AbortSignal) => {
      const data = jsonObject(await request('tasks/assignments/reassign', { id, revision, candidate }, signal, grant.sessionToken));
      if (data.kind !== 'task-reassigned' || data.taskId !== id) throw new AuthError('bad-response');
    },
    reassignTasks: async (grant: Grant, items: readonly TaskTransfer[], signal?: AbortSignal) => {
      const data = await request('tasks/assignments/reassign-bulk', { items }, signal, grant.sessionToken);
      confirmedBatch(data, 'tasks-reassigned', items);
    },
    publishTree: async (grant: Grant, path: PublishPath, query?: string, after?: string, signal?: AbortSignal) => {
      const data = decodePublishTree(await request('projects/publishing/tree', { ...path, query, after }, signal, grant.sessionToken),
        path.tool !== undefined);
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    publishOrders: async (grant: Grant, path: PublishCustomer, before?: number, signal?: AbortSignal) => {
      const data = decodePurchaseOrders(await request('projects/publishing/orders', { ...path, before }, signal, grant.sessionToken));
      if (!data || (before !== undefined && data.items.some((item) => item.id >= before))) throw new AuthError('bad-response');
      return data;
    },
    publishOrder: async (grant: Grant, id: number, signal?: AbortSignal) => {
      const data = decodePurchaseOrder(await request('projects/publishing/order', { id }, signal, grant.sessionToken));
      if (!data || data.item.id !== id) throw new AuthError('bad-response');
      return data;
    },
    publishOrderTasks: async (grant: Grant, id: number, before?: number, signal?: AbortSignal) => {
      const body = jsonObject(await request('projects/publishing/tasks', { id, before }, signal, grant.sessionToken));
      const data = decodeAssignedTasks(body);
      if (body.orderId !== id || !data || (before !== undefined && data.items.some((item) => item.id >= before))) throw new AuthError('bad-response');
      return data;
    },
    projectAttachments: async (grant: Grant, target: AttachmentTarget, signal?: AbortSignal) => {
      const attachments = decodeAttachments(await request('projects/attachments/list', target, signal, grant.sessionToken), target);
      if (!attachments) throw new AuthError('bad-response');
      return attachments;
    },
    signOut: async (grant: Grant, signal?: AbortSignal) => { await request('sign-out', {}, signal, grant.sessionToken); },
    projectCreateOptions: async (grant: Grant, filters: { query?: string; functionQuery?: string }, signal?: AbortSignal) => {
      const data = decodeProjectCreateOptions(await request('projects/create-options', filters, signal, grant.sessionToken));
      if (!data) throw new AuthError('bad-response');
      return data;
    },
    createProject: async (grant: Grant, draft: ProjectDraft, signal?: AbortSignal) => {
      const data = decodeCreatedProject(await request('projects/create', draft, signal, grant.sessionToken));
      if (!data || data.name !== draft.name.trim() || data.customer !== draft.context.customer || data.tool !== draft.context.tool
          || data.suite !== draft.context.suite || data.function !== draft.function || data.responsibility !== draft.responsibility) {
        throw new AuthError('bad-response');
      }
      return data;
    },
    startRecovery: async (details: { companyCode: string; username: string; channel: 'email' | 'sms' }, signal?: AbortSignal) => decodeRecovery(await request('recovery/start', details, signal)),
    verifyRecovery: async (challengeId: string, code: string, signal?: AbortSignal) => decodeRecovery(await request('recovery/verify', { challengeId, code }, signal)),
    completeRecovery: async (resetGrant: string, password: string, signal?: AbortSignal) => decodeRecovery(await request('recovery/complete', { resetGrant, password }, signal)),
  };
}
