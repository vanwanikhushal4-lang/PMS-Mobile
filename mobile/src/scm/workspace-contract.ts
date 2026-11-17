export type IncidentStatus = { status: string | null; count: number };
export type IncidentActivity = { incidentId: string; date: string | null; status: string | null; message: string | null };
export type Workspace = { statuses: IncidentStatus[]; activity: IncidentActivity[]; total: number };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
}
function nullableText(value: unknown): value is string | null {
  return value === null || text(value);
}
function nullableDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}Z`);
  return Number.isFinite(date.getTime()) && date.toISOString() === `${value}.000Z`;
}

export function decodeWorkspace(value: unknown): Workspace | null {
  const body = object(value);
  if (body?.kind !== 'workspace' || !Array.isArray(body.statuses) || !Array.isArray(body.activity) || body.activity.length > 20) return null;
  const statuses: IncidentStatus[] = [];
  const seenStatuses = new Set<string | null>();
  let total = 0;
  for (const raw of body.statuses as unknown[]) {
    const row = object(raw);
    if (!row || !nullableText(row.status) || typeof row.count !== 'number' || !Number.isSafeInteger(row.count)
      || row.count < 1 || seenStatuses.has(row.status)) return null;
    statuses.push({ status: row.status, count: row.count });
    seenStatuses.add(row.status);
    total += row.count;
  }
  if (!Number.isSafeInteger(total)) return null;
  const activity: IncidentActivity[] = [];
  const seenIncidents = new Set<string>();
  for (const raw of body.activity as unknown[]) {
    const row = object(raw);
    if (!row || !text(row.incidentId) || seenIncidents.has(row.incidentId) || !nullableText(row.status) || !nullableText(row.message)
      || !nullableDate(row.date)) return null;
    activity.push({ incidentId: row.incidentId, status: row.status, message: row.message, date: row.date });
    seenIncidents.add(row.incidentId);
  }
  return { statuses, activity, total };
}
