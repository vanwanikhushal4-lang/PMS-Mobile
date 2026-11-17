export type AssignedTask = {
  id: number; module: string; status: string; customer: string; suite: string; tool: string;
  description: string; lead: string; developer: string; assigner: string; start: string; due: string;
};
export type AssignedTaskPage = { items: AssignedTask[]; next: number | null };
export type WorkLog = { taskId: number; items: { id: number; date: string; note: string; status: string; author: string }[]; hasMore: boolean };

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
    const { id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due } = row;
    const previous = items.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(module) || !label(status) || !label(customer)
      || !label(suite) || !label(tool) || typeof description !== 'string' || description.length > 16_384
      || !label(lead) || !label(developer) || !label(assigner) || !label(start) || !label(due)) return null;
    items.push({ id: number, module, status, customer, suite, tool, description, lead, developer, assigner, start, due });
  }
  const next = body.next;
  if (next !== null && (!id(next) || items.length !== 30 || items.at(-1)?.id !== next)) return null;
  return { items, next };
}

export function decodeWorkLog(value: unknown): WorkLog | null {
  const body = object(value);
  if (body?.kind !== 'task-work-log' || !id(body.taskId) || typeof body.hasMore !== 'boolean'
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
  return { taskId: body.taskId, items, hasMore: body.hasMore };
}
