export type PublishPath = { phase?: string; suite?: string; tool?: string };
export type PublishCustomer = Required<PublishPath> & { customer: string };
export type PublishNode = { label: string; completedWeight: string | null };
export type PurchaseOrder = {
  id: number; reference: string; customer: string; suite: string; tool: string; number: string; date: string; status: string;
};
type FormFields = 'project' | 'date' | 'status' | 'license' | 'salesManager' | 'implementor' | 'implementorPhone'
  | 'implementorEmail' | 'endCustomer' | 'endCustomerPhone';
export type FormC = Record<FormFields, string> & {
  milestones: { name: string; description: string; responsibility: string; start: string; due: string }[];
};
export type PurchaseOrderDetail = {
  item: PurchaseOrder & { formStatus: string; paymentTerms: string; license: string; projectId: number | null };
  formC: FormC | null;
};

function object(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}
function fields<K extends string>(row: Record<string, unknown>, names: readonly K[], max = 500): Record<K, string> | null {
  const values = {} as Record<K, string>;
  for (const name of names) {
    const value = row[name];
    if (typeof value !== 'string' || value.length > max) return null;
    values[name] = value;
  }
  return values;
}

export function decodePublishTree(value: unknown, customers: boolean) {
  const body = object(value);
  if (body?.kind !== 'publish-tree' || !Array.isArray(body.items) || body.items.length > 30) return null;
  const items: PublishNode[] = [];
  for (const raw of body.items as unknown[]) {
    const row = object(raw);
    const label = row?.label;
    if (typeof label !== 'string' || !label.trim() || label.length > 240 || items.some((item) => item.label === label)) return null;
    const weight = row?.completedWeight;
    if (customers ? typeof weight !== 'string' || !/^\d{1,3}(\.\d{1,6})?$/.test(weight) || Number(weight) > 100 : weight !== null) return null;
    items.push({ label, completedWeight: typeof weight === 'string' ? weight : null });
  }
  if (body.next !== null && (items.length !== 30 || body.next !== items.at(-1)?.label)) return null;
  return { items, next: typeof body.next === 'string' ? body.next : null };
}

function purchaseOrder(value: unknown): PurchaseOrder | null {
  const row = object(value);
  if (!row || !id(row.id)) return null;
  const labels = fields(row, ['reference', 'customer', 'suite', 'tool', 'number', 'date', 'status'] as const);
  return labels && /^PO-/i.test(labels.reference) ? { id: row.id, ...labels } : null;
}

export function decodePurchaseOrders(value: unknown) {
  const body = object(value);
  if (body?.kind !== 'publish-orders' || !Array.isArray(body.items) || body.items.length > 30) return null;
  const items: PurchaseOrder[] = [];
  for (const raw of body.items as unknown[]) {
    const item = purchaseOrder(raw);
    const previous = items.at(-1);
    if (!item || (previous && item.id >= previous.id)) return null;
    items.push(item);
  }
  if (body.next !== null && (items.length !== 30 || body.next !== items.at(-1)?.id)) return null;
  return { items, next: id(body.next) ? body.next : null };
}

export function decodePurchaseOrder(value: unknown): PurchaseOrderDetail | null {
  const body = object(value);
  if (body?.kind !== 'publish-order') return null;
  const item = purchaseOrder(body.item);
  const row = object(body.item);
  if (!item || !row || (row.projectId !== null && !id(row.projectId))) return null;
  const extra = fields(row, ['formStatus', 'paymentTerms', 'license'] as const);
  if (!extra) return null;
  const detail = { ...item, ...extra, projectId: row.projectId };
  if (body.formC === null) return { item: detail, formC: null };
  const form = object(body.formC);
  if (!form || !Array.isArray(form.milestones) || form.milestones.length > 8) return null;
  const labels = fields(form, ['project', 'date', 'status', 'license', 'salesManager', 'implementor', 'implementorPhone',
    'implementorEmail', 'endCustomer', 'endCustomerPhone'] as const);
  if (!labels) return null;
  const milestones: FormC['milestones'] = [];
  for (const raw of form.milestones as unknown[]) {
    const record = object(raw);
    const milestone = record ? fields(record, ['name', 'description', 'responsibility', 'start', 'due'] as const) : null;
    if (!milestone || !milestone.name || milestones.some(({ name }) => name === milestone.name)) return null;
    milestones.push(milestone);
  }
  return { item: detail, formC: { ...labels, milestones } };
}
