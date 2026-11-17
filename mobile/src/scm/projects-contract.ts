export type Project = {
  id: number;
  name: string;
  customer: string;
  function: string;
  responsibility: string;
  suite: string;
  tool: string;
  reference: string;
  favorite: boolean;
};
export type ProjectPage = { items: Project[]; next: number | null };
export type Profile = { email: string; phone: string; location: string; site: string; department: string; subdepartment: string };
export type ProjectRecord = { id: number; reference: string; date: string; status: string; format: string };
export type ProjectRecordGroup = { items: ProjectRecord[]; hasMore: boolean };
export type ProjectRecords = { projectId: number; requirements: ProjectRecordGroup; understanding: ProjectRecordGroup; kickoff: ProjectRecordGroup };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function label(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 500;
}
function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

export function decodeProfile(value: unknown): Profile | null {
  const record = object(value);
  if (record?.kind !== 'profile') return null;
  const { email, phone, location, site, department, subdepartment } = record;
  return label(email) && label(phone) && label(location) && label(site) && label(department) && label(subdepartment)
    ? { email, phone, location, site, department, subdepartment } : null;
}

function project(value: unknown): Project | null {
  const row = object(value);
  if (!row) return null;
  const { id: number, name, customer, function: work, responsibility, suite, tool, reference, favorite = false } = row;
  return id(number) && label(name) && label(customer) && label(work) && label(responsibility) && label(suite) && label(tool) && label(reference)
    && typeof favorite === 'boolean' ? { id: number, name, customer, function: work, responsibility, suite, tool, reference, favorite } : null;
}

export function decodeProject(value: unknown): Project | null {
  const body = object(value);
  return body?.kind === 'project' ? project(body.item) : null;
}

export function decodeProjects(value: unknown): ProjectPage | null {
  const body = object(value);
  if (body?.kind !== 'projects' || !Array.isArray(body.items) || body.items.length > 30) return null;
  const items: Project[] = [];
  for (const value of body.items as unknown[]) {
    const item = project(value);
    const previous = items.at(-1);
    if (!item || (previous && item.id >= previous.id)) return null;
    items.push(item);
  }
  const next = body.next;
  if (next !== null && (!id(next) || items.length !== 30 || items.at(-1)?.id !== next)) return null;
  return { items, next };
}

function group(value: unknown): ProjectRecordGroup | null {
  const body = object(value);
  if (!body || typeof body.hasMore !== 'boolean' || !Array.isArray(body.items) || body.items.length > 20
    || (body.hasMore && body.items.length !== 20)) return null;
  const items: ProjectRecord[] = [];
  for (const value of body.items as unknown[]) {
    const row = object(value);
    if (!row) return null;
    const { id: number, reference, date, status, format } = row;
    const previous = items.at(-1);
    if (!id(number) || (previous && number >= previous.id) || !label(reference) || !label(date) || !label(status) || !label(format)) return null;
    items.push({ id: number, reference, date, status, format });
  }
  return { items, hasMore: body.hasMore };
}

export function decodeProjectRecords(value: unknown): ProjectRecords | null {
  const body = object(value);
  if (body?.kind !== 'project-records' || !id(body.projectId)) return null;
  const requirements = group(body.requirements);
  const understanding = group(body.understanding);
  const kickoff = group(body.kickoff);
  return requirements && understanding && kickoff ? { projectId: body.projectId, requirements, understanding, kickoff } : null;
}
