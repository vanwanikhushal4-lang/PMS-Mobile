import { decodeTaskContext, type TaskContext } from './tasks-contract.ts';

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
export type ProjectDraft = { name: string; function: string; responsibility: string; context: TaskContext; requestKey: string };
export type Profile = { email: string; phone: string; location: string; site: string; department: string; subdepartment: string };
export type ProjectRecord = { id: number; reference: string; date: string; status: string; format: string };
export type ProjectRecordGroup = { items: ProjectRecord[]; hasMore: boolean };
export type ProjectRecords = { projectId: number; requirements: ProjectRecordGroup; understanding: ProjectRecordGroup; kickoff: ProjectRecordGroup };
export type ProjectRecordScope = 'requirement' | 'understanding' | 'kickoff';
export type ProjectRecordTarget = { scope: ProjectRecordScope; id: number; recordId: number };
export type ProjectRecordDetail = { item: ProjectRecord; fields: Record<string, string> };

export const projectRecordTitles: Record<ProjectRecordScope, string> = {
  requirement: 'Requirement document', understanding: 'Understanding document', kickoff: 'Kickoff meeting',
};

export const projectRecordSections: Record<ProjectRecordScope, readonly {
  title: string;
  rows: readonly (readonly [string, string])[];
}[]> = {
  requirement: [
    { title: 'Requirements', rows: [['description', 'Description'], ['requirementNote', 'Requirement note']] },
    { title: 'Submission', rows: [['purchaseOrder', 'Purchase order'], ['submittedBy', 'Submitted by'], ['designation', 'Designation'],
      ['productManager', 'Product manager'], ['function', 'Function'], ['suite', 'Product suite'], ['tool', 'Product tool']] },
  ],
  understanding: [
    { title: 'Project plan', rows: [['projectDescription', 'Project description'], ['objectives', 'Objectives'], ['projectScope', 'Scope'],
      ['start', 'Start date'], ['end', 'End date']] },
    { title: 'Requirements', rows: [['functional', 'Functional requirements'], ['nonfunctional', 'Nonfunctional requirements'],
      ['technical', 'Technical requirements']] },
    { title: 'Review', rows: [['rejectedBy', 'Rejected by'], ['rejectedDate', 'Rejection date'], ['rejectionReason', 'Rejection reason']] },
    { title: 'Document notes', rows: [['description', 'Description'], ['requirementNote', 'Requirement note'],
      ['understandingNote', 'Understanding note']] },
    { title: 'Submission', rows: [['purchaseOrder', 'Purchase order'], ['requirementReference', 'Requirement document'],
      ['submittedBy', 'Submitted by'], ['designation', 'Designation'], ['productManager', 'Product manager'], ['teamLead', 'Team lead'],
      ['developers', 'Developers'], ['function', 'Function'], ['suite', 'Product suite'], ['tool', 'Product tool']] },
  ],
  kickoff: [
    { title: 'Meeting logistics', rows: [['conference', 'Video conference'], ['meetingLink', 'Meeting link'], ['telephone', 'Telephone'],
      ['room', 'Room type'], ['roomCapacity', 'Room capacity'], ['meetingResource', 'Meeting resource'], ['resources', 'Additional resources']] },
    { title: 'Participants', rows: [['projectHead', 'Project head'], ['salesManager', 'Sales manager'], ['productManager', 'Product manager'],
      ['attendees', 'Attendees']] },
    { title: 'References', rows: [['purchaseOrder', 'Purchase order'], ['understandingReference', 'Understanding document']] },
  ],
};

export function isProjectRecordScope(value: unknown): value is ProjectRecordScope {
  return value === 'requirement' || value === 'understanding' || value === 'kickoff';
}

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

export function decodeCreatedProject(value: unknown): Project | null {
  const body = object(value);
  return body?.kind === 'project-created' ? project(body.item) : null;
}

export function decodeProjectCreateOptions(value: unknown) {
  const body = object(value);
  if (body?.kind !== 'project-create-options' || typeof body.moreContexts !== 'boolean' || typeof body.moreFunctions !== 'boolean'
    || !Array.isArray(body.contexts) || body.contexts.length > 30 || !Array.isArray(body.functions) || body.functions.length > 30
    || (body.moreContexts && body.contexts.length !== 30) || (body.moreFunctions && body.functions.length !== 30)
    || !Array.isArray(body.responsibilities) || !body.responsibilities.length || body.responsibilities.length > 30) return null;
  const contexts: TaskContext[] = [];
  for (const raw of body.contexts as unknown[]) {
    const context = decodeTaskContext(raw);
    if (!context) return null;
    contexts.push(context);
  }
  const functions: string[] = [];
  const responsibilities: string[] = [];
  for (const [raw, choices] of [[body.functions, functions], [body.responsibilities, responsibilities]] as const) {
    for (const name of raw as unknown[]) {
      if (typeof name !== 'string' || !name || name.length > 240 || choices.includes(name)) return null;
      choices.push(name);
    }
  }
  return { contexts, functions, responsibilities, moreContexts: body.moreContexts, moreFunctions: body.moreFunctions };
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
    const row = record(value);
    const previous = items.at(-1);
    if (!row || (previous && row.id >= previous.id)) return null;
    items.push(row);
  }
  return { items, hasMore: body.hasMore };
}

function record(value: unknown): ProjectRecord | null {
  const { id: number, reference, date, status, format } = object(value) ?? {};
  return id(number) && label(reference) && label(date) && label(status) && label(format)
    ? { id: number, reference, date, status, format } : null;
}

export function decodeProjectRecordDetail(value: unknown, target: ProjectRecordTarget): ProjectRecordDetail | null {
  const body = object(value);
  if (body?.kind !== 'project-record-detail' || body.projectId !== target.id || body.scope !== target.scope) return null;
  const item = record(body.item);
  const raw = object(body.fields);
  if (!item || item.id !== target.recordId || !raw) return null;
  const fields: Record<string, string> = {};
  for (const section of projectRecordSections[target.scope]) {
    for (const [key] of section.rows) {
      const text = raw[key];
      if (text === undefined) continue;
      if (typeof text !== 'string' || !text || text.length > 65_535) return null;
      fields[key] = text;
    }
  }
  return { item, fields };
}

export function decodeProjectRecords(value: unknown): ProjectRecords | null {
  const body = object(value);
  if (body?.kind !== 'project-records' || !id(body.projectId)) return null;
  const requirements = group(body.requirements);
  const understanding = group(body.understanding);
  const kickoff = group(body.kickoff);
  return requirements && understanding && kickoff ? { projectId: body.projectId, requirements, understanding, kickoff } : null;
}
