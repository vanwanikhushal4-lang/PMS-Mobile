import type { ProjectRecordTarget } from './projects-contract.ts';

export type AttachmentTarget = { scope: 'purchase-order'; id: number } | ProjectRecordTarget;

const kinds = {
  'purchase-order': ['masked-po', 'product-features'],
  requirement: ['requirement-file', 'masked-po', 'scope-of-work', 'rfp', 'other'],
  understanding: ['understanding-file', 'other-understanding', 'requirement-file', 'masked-po', 'scope-of-work', 'rfp', 'other'],
  kickoff: ['kickoff-agenda', 'kickoff-plan'],
} as const;

export type AttachmentKind = (typeof kinds)[keyof typeof kinds][number];
export type Attachment = { kind: AttachmentKind; name: string; mimeType: string };

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function decodeAttachments(value: unknown, target: AttachmentTarget): Attachment[] | null {
  const result = object(value);
  const allowed: readonly string[] = kinds[target.scope];
  if (result?.kind !== 'project-attachments' || result.scope !== target.scope || result.id !== target.id
      || result.recordId !== ('recordId' in target ? target.recordId : undefined) || !Array.isArray(result.items)
      || result.items.length > allowed.length) return null;
  const attachments: Attachment[] = [];
  for (const raw of result.items as unknown[]) {
    const item = object(raw);
    const { kind, name, mimeType } = item ?? {};
    if (typeof kind !== 'string' || !allowed.includes(kind) || attachments.some((asset) => asset.kind === kind)) return null;
    if (typeof name !== 'string' || !name || name.length > 255 || name !== name.trim() || name.endsWith('.')
        || Array.from(name).some((letter) => /[\\/:*?"<>|]/.test(letter) || letter.charCodeAt(0) < 32
          || (letter.charCodeAt(0) >= 127 && letter.charCodeAt(0) <= 159))) return null;
    if (typeof mimeType !== 'string' || mimeType.length > 100 || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mimeType)) return null;
    attachments.push({ kind: kind as AttachmentKind, name, mimeType });
  }
  return attachments;
}
