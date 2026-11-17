export type AssignedTask = {
  id: number; module: string; status: string; customer: string; suite: string; tool: string;
  description: string; lead: string; developer: string; assigner: string; start: string; due: string;
  workLog: boolean; dateAccess: boolean; dateApproval: string;
};
export type AssignedTaskPage = { items: AssignedTask[]; next: number | null };
export type WorkLog = {
  taskId: number; items: { id: number; date: string; note: string; status: string; author: string }[];
  hasMore: boolean; date: string; completed: boolean; loggedToday: boolean;
};
export type DateQueue = 'mine' | 'team' | 'review';
export type TaskDates = {
  taskId: number; start: string; due: string; approval: string; requestedStart: string; requestedDue: string; reason: string;
  revision: string | null; requestMode: 'due' | 'schedule' | 'none'; canApprove: boolean; hasMore: boolean;
  history: { id: number; start: string; due: string; revisedStart: string; revisedDue: string; approvedAt: string; by: string; reason: string }[];
};

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}
function label(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 500;
}

export function decodeAssignedTasks(value: unknown): AssignedTaskPage | null {
  const body = object(value);
  if (body?.kind !== 'assigned-tasks' || !Array.isArray(body.items) || body.items.length > 30) return null;
  const items: AssignedTask[] = [];
  for (const raw of body.items as unknown[]) {
    const row = object(raw);
    if (!row) return null;
    const { id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due,
      workLog = false, dateAccess = false, dateApproval = '' } = row;
    const previous = items.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(module) || !label(status) || !label(customer)
      || !label(suite) || !label(tool) || typeof description !== 'string' || description.length > 16_384
      || !label(lead) || !label(developer) || !label(assigner) || !label(start) || !label(due) || typeof workLog !== 'boolean'
      || typeof dateAccess !== 'boolean' || !label(dateApproval)) return null;
    items.push({ id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due, workLog, dateAccess, dateApproval });
  }
  const next = body.next;
  if (next !== null && (!id(next) || items.length !== 30 || items.at(-1)?.id !== next)) return null;
  return { items, next };
}

export function decodeTaskDates(value: unknown): TaskDates | null {
  const body = object(value);
  if (body?.kind !== 'task-dates' || !id(body.taskId) || typeof body.canApprove !== 'boolean' || typeof body.hasMore !== 'boolean'
    || !Array.isArray(body.history) || body.history.length > 20 || (body.hasMore && body.history.length !== 20)) return null;
  const { start, due, approval, requestedStart, requestedDue, reason, revision, requestMode } = body;
  if (!label(start) || !label(due) || !label(approval) || !label(requestedStart) || !label(requestedDue) || !label(reason)
    || (revision !== null && (typeof revision !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(revision)))
    || (body.canApprove && revision === null) || (revision !== null && requestMode !== 'none')
    || (requestMode !== 'none' && requestMode !== 'due' && requestMode !== 'schedule')) return null;
  const history: TaskDates['history'] = [];
  for (const raw of body.history as unknown[]) {
    const row = object(raw);
    if (!row) return null;
    const { id: number, start, due, revisedStart, revisedDue, approvedAt, by, reason } = row;
    const previous = history.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(start) || !label(due) || !label(revisedStart)
      || !label(revisedDue) || !label(approvedAt) || !label(by) || !label(reason)) return null;
    history.push({ id: number, start, due, revisedStart, revisedDue, approvedAt, by, reason });
  }
  return { taskId: body.taskId, start, due, approval, requestedStart, requestedDue, reason,
    revision, requestMode, canApprove: body.canApprove, history, hasMore: body.hasMore };
}

export function decodeWorkLog(value: unknown): WorkLog | null {
  const body = object(value);
  if (body?.kind !== 'task-work-log' || !id(body.taskId) || typeof body.hasMore !== 'boolean'
    || typeof body.date !== 'string' || !/^\d{2}\.\d{2}\.\d{4}$/.test(body.date)
    || typeof body.completed !== 'boolean' || typeof body.loggedToday !== 'boolean' || (body.completed && body.loggedToday)
    || !Array.isArray(body.items) || body.items.length > 20 || (body.hasMore && body.items.length !== 20)) return null;
  const items: WorkLog['items'] = [];
  for (const raw of body.items as unknown[]) {
    const row = object(raw);
    if (!row) return null;
    const { id: number, date, note, status, author } = row;
    const previous = items.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(date) || !label(status) || !label(author)
      || typeof note !== 'string' || note.length > 16_384) return null;
    items.push({ id: number, date, note, status, author });
  }
  return { taskId: body.taskId, items, hasMore: body.hasMore, date: body.date, completed: body.completed, loggedToday: body.loggedToday };
}
