export type AssignedTask = {
  id: number; module: string; status: string; customer: string; suite: string; tool: string;
  description: string; lead: string; developer: string; assigner: string; start: string; due: string;
  workLog: boolean; dateAccess: boolean; dateApproval: string; reassignable: boolean;
  reference: string; priority: string; weight: string; function: string; responsibility: string;
  dateReview: DateReview | null; assignedAt: string;
};
export type AssignedTaskPage = { items: AssignedTask[]; next: number | null };
export type WorkLog = {
  taskId: number; items: { id: number; date: string; note: string; status: string; author: string }[];
  hasMore: boolean; date: string; completed: boolean; loggedToday: boolean;
};
export type DateQueue = 'mine' | 'team' | 'review';
export type DateApproval = { id: number; revision: string };
export type DateProposal = DateApproval & { start: string; due: string; reason: string };
type DateReview = { revision: string; start: string; due: string; reason: string; canApprove: boolean };
export type TaskAssignee = { key: string; name: string; role: string; lead: string; manager: string };
export type TaskContext = { customer: string; suite: string; tool: string };
export type StandaloneTask = { context: TaskContext; function: string; responsibility: string };
export type TaskTransfer = { id: number; revision: string; candidate: string };
export type TaskDraft = {
  module: string; description: string; start: string; due: string; priority: string; weight: string; candidate: string; requestKey: string;
};
export type TaskDates = {
  taskId: number; start: string; due: string; approval: string; requestedStart: string; requestedDue: string; reason: string;
  revision: string | null; scheduleRevision: string | null; requestMode: 'due' | 'schedule' | 'none'; canApprove: boolean; hasMore: boolean;
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
function revisionToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}
function decodeDateReview(value: unknown): DateReview | null {
  const row = object(value);
  if (!row) return null;
  const { start, due, reason, revision, canApprove } = row;
  return label(start) && label(due) && label(reason) && revisionToken(revision) && typeof canApprove === 'boolean'
    ? { start, due, reason, revision, canApprove } : null;
}

export function decodeAssignedTasks(value: unknown): AssignedTaskPage | null {
  const body = object(value);
  if (body?.kind !== 'assigned-tasks' || !Array.isArray(body.items) || body.items.length > 30) return null;
  const items: AssignedTask[] = [];
  for (const raw of body.items as unknown[]) {
    const row = object(raw);
    if (!row) return null;
    const { id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due,
      workLog = false, dateAccess = false, dateApproval = '', reassignable = false, reference = '', priority = '', weight = '',
      function: functionName = '', responsibility = '', assignedAt = '' } = row;
    const previous = items.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(module) || !label(status) || !label(customer)
      || !label(suite) || !label(tool) || typeof description !== 'string' || description.length > 16_384
      || !label(lead) || !label(developer) || !label(assigner) || !label(start) || !label(due) || typeof workLog !== 'boolean'
      || typeof dateAccess !== 'boolean' || !label(dateApproval) || typeof reassignable !== 'boolean'
      || !label(reference) || !label(priority) || !label(weight) || !label(functionName) || !label(responsibility) || !label(assignedAt)) return null;
    const dateReview = decodeDateReview(row.dateReview);
    if (row.dateReview !== undefined && row.dateReview !== null && (!dateReview || !dateAccess)) return null;
    items.push({ id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due,
      workLog, dateAccess, dateApproval, reassignable, reference, priority, weight, function: functionName, responsibility, dateReview, assignedAt });
  }
  const next = body.next;
  if (next !== null && (!id(next) || items.length !== 30 || items.at(-1)?.id !== next)) return null;
  return { items, next };
}

export function decodeTaskAssignees(value: unknown) {
  const body = object(value);
  if (body?.kind !== 'task-assignees' || (body.id !== null && !id(body.id)) || typeof body.hasMore !== 'boolean'
    || !Array.isArray(body.items) || body.items.length > 30 || (body.hasMore && body.items.length !== 30)
    || (body.revision !== null && !revisionToken(body.revision))) return null;
  const items: TaskAssignee[] = [];
  const keys = new Set<string>();
  for (const raw of body.items as unknown[]) {
    const row = object(raw);
    if (!row) return null;
    const { key, name, role, lead, manager } = row;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(key) || keys.has(key)
      || !label(name) || !name || !label(role) || !label(lead) || !label(manager)) return null;
    keys.add(key);
    items.push({ key, name, role, lead, manager });
  }
  return { id: body.id, revision: body.revision, items, hasMore: body.hasMore, context: decodeTaskContext(body.context) };
}

export function decodeTaskContext(value: unknown): TaskContext | null {
  const row = object(value);
  const { customer, suite, tool } = row ?? {};
  if (!label(customer) || !customer || customer.length > 240 || !label(suite) || !suite || suite.length > 240
      || !label(tool) || !tool || tool.length > 240) return null;
  return { customer, suite, tool };
}

function choiceList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 30) return null;
  const items: string[] = [];
  for (const item of value as unknown[]) {
    if (!label(item) || !item || items.includes(item)) return null;
    items.push(item);
  }
  return items;
}

export function decodeTaskContexts(value: unknown) {
  const body = object(value);
  if (body?.kind !== 'task-contexts' || typeof body.hasMore !== 'boolean' || !Array.isArray(body.items)
      || body.items.length > 30 || (body.hasMore && body.items.length !== 30)) return null;
  const functions = choiceList(body.functions);
  const responsibilities = choiceList(body.responsibilities);
  if (!functions || !responsibilities) return null;
  const items: TaskContext[] = [];
  for (const raw of body.items as unknown[]) {
    const context = decodeTaskContext(raw);
    if (!context) return null;
    items.push(context);
  }
  return { items, hasMore: body.hasMore, functions, responsibilities };
}

export function decodeTaskDates(value: unknown): TaskDates | null {
  const body = object(value);
  if (body?.kind !== 'task-dates' || !id(body.taskId) || typeof body.canApprove !== 'boolean' || typeof body.hasMore !== 'boolean'
    || !Array.isArray(body.history) || body.history.length > 20 || (body.hasMore && body.history.length !== 20)) return null;
  const { start, due, approval, requestedStart, requestedDue, reason, revision, scheduleRevision = null, requestMode } = body;
  if (!label(start) || !label(due) || !label(approval) || !label(requestedStart) || !label(requestedDue) || !label(reason)
    || (revision !== null && !revisionToken(revision)) || (scheduleRevision !== null && !revisionToken(scheduleRevision))
    || (revision !== null && scheduleRevision !== null && scheduleRevision !== revision)
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
    revision, scheduleRevision, requestMode, canApprove: body.canApprove, history, hasMore: body.hasMore };
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
