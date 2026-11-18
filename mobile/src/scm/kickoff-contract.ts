export type KickoffTarget = { id: number; recordId: number };
export const kickoffGroups = ['heads', 'sales', 'managers'] as const;
export type KickoffGroup = (typeof kickoffGroups)[number];
type Participant = { id: number; name: string };
type Roster = { choices: Participant[]; hasMore: boolean };
export type KickoffOptions = { purchaseOrder: string; understanding: string; kickoffStatus: string; timeZone: string; rooms: string[]; providers: string[];
  roster: Record<KickoffGroup, Roster> };
export type KickoffDraft = KickoffTarget & { time: string; requestKey: string; heads: number[]; sales: number[]; managers: number[] }
  & ({ mode: 'Physical Mode'; rooms: string[] } | { mode: 'Virtual Mode'; provider: string; connection: string });

export const kickoffMaxFile = 10 * 1024 * 1024;

export function validKickoffTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const date = new Date(`${value}:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString() === `${value}:00.000Z`;
}

export function validKickoffFilename(name: string) {
  return name.length <= 160 && name === name.trim() && !/[\\/:*?"<>|]/.test(name)
    && [...name].every((letter) => letter.charCodeAt(0) >= 32 && (letter.charCodeAt(0) < 127 || letter.charCodeAt(0) > 159))
    && /.+\.(pdf|docx?|xlsx?|pptx?|txt|csv|jpe?g|png|zip)$/i.test(name);
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function label(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function id(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

function labels(value: unknown): string[] | null {
  return Array.isArray(value) && value.length <= 20 && value.every((value: unknown) => label(value))
    && new Set(value).size === value.length ? value as string[] : null;
}

export function decodeKickoffOptions(value: unknown, target: KickoffTarget): KickoffOptions | null {
  const result = object(value);
  if (result?.kind !== 'kickoff-options' || result.projectId !== target.id || result.recordId !== target.recordId
    || !label(result.purchaseOrder) || !label(result.understanding) || typeof result.kickoffStatus !== 'string' || result.kickoffStatus.length > 128) return null;
  const rooms = labels(result.rooms);
  const providers = labels(result.providers);
  if (!rooms || !providers || !providers.length || !label(result.timeZone)) return null;
  try { new Intl.DateTimeFormat('en', { timeZone: result.timeZone }); } catch { return null; }
  const roster = {} as Record<KickoffGroup, Roster>;
  for (const group of kickoffGroups) {
    const entries = result[group];
    const hasMore = result[`${group}More`];
    if (!Array.isArray(entries) || entries.length > 40 || typeof hasMore !== 'boolean' || (hasMore && entries.length !== 40)) return null;
    const choices: Participant[] = [];
    for (const entry of entries as unknown[]) {
      const person = object(entry);
      if (!person || !id(person.id) || !label(person.name) || choices.some((item) => item.id === person.id)) return null;
      choices.push({ id: person.id, name: person.name });
    }
    roster[group] = { choices, hasMore };
  }
  return { purchaseOrder: result.purchaseOrder, understanding: result.understanding, kickoffStatus: result.kickoffStatus, timeZone: result.timeZone, rooms, providers, roster };
}

export function decodeScheduledKickoff(value: unknown, target: KickoffTarget): number | null {
  const result = object(value);
  return result?.kind === 'kickoff-scheduled' && result.projectId === target.id && result.recordId === target.recordId
    && id(result.meetingId) ? result.meetingId : null;
}
