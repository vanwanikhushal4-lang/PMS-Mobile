/** Responses for the additive mobile authentication API under /mobile/v1/auth. */
export type Identity = Readonly<{
  username: string;
  displayName: string;
  companyCode: string;
  companyName: string;
  role: string;
  designation: string;
  capabilities: readonly string[];
}>;

export type AuthStep =
  | { kind: 'authenticated'; identity: Identity; expiresAt: number }
  | { kind: 'challenge'; challengeId: string; expiresAt: number; method: 'sms' | 'totp'; canResend: boolean; maskedDestination?: string }
  | { kind: 'enrollment'; challengeId: string; expiresAt: number; method: 'totp'; setupUri: string }
  | { kind: 'rejected'; reason: 'invalid-credentials' | 'invalid-code' | 'expired' | 'rate-limited' | 'account-unavailable' | 'password-policy' };

type RecordValue = Record<string, unknown>;
const capabilitiesPattern = /^[a-z][a-z0-9_.:-]{0,95}$/;
const opaqueIdPattern = /^[A-Za-z0-9_-]{22,256}$/;

function record(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : null;
}

function label(value: unknown, max = 128): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}

function decodeIdentity(value: unknown): Identity | null {
  const item = record(value);
  if (!item) return null;
  const username = label(item.username);
  const displayName = label(item.displayName);
  const companyCode = label(item.companyCode, 48);
  const companyName = label(item.companyName);
  const role = label(item.role, 96);
  const designation = item.designation === '' ? '' : label(item.designation);
  const capabilities = item.capabilities;
  if (!username || !displayName || !companyCode || !companyName || !role || designation === null || !Array.isArray(capabilities)
    || capabilities.length > 400 || !capabilities.every((entry) => typeof entry === 'string' && capabilitiesPattern.test(entry))) return null;
  return { username, displayName, companyCode, companyName, role, designation, capabilities: [...new Set(capabilities)] };
}

export function decodeAuthStep(payload: unknown, now = Date.now()): AuthStep | null {
  const item = record(payload);
  if (!item) return null;
  if (item.kind === 'rejected') {
    const reason = item.reason;
    if (reason === 'invalid-credentials' || reason === 'invalid-code' || reason === 'expired'
      || reason === 'rate-limited' || reason === 'account-unavailable' || reason === 'password-policy') return { kind: 'rejected', reason };
    return null;
  }
  const expiresAt = item.expiresAt;
  if (typeof expiresAt !== 'number' || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
  if (item.kind === 'authenticated') {
    const identity = decodeIdentity(item.identity);
    return identity ? { kind: 'authenticated', expiresAt, identity } : null;
  }
  if (expiresAt - now > 15 * 60 * 1000) return null;
  const challengeId = item.challengeId;
  if (typeof challengeId !== 'string' || !opaqueIdPattern.test(challengeId)) return null;
  if (item.kind === 'enrollment' && item.method === 'totp') {
    const setupUri = item.setupUri;
    if (typeof setupUri !== 'string' || setupUri.length > 1024) return null;
    try {
      const uri = new URL(setupUri);
      if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp' || !uri.pathname.slice(1) || uri.hash
        || uri.username || uri.password || uri.port || !/^[A-Z2-7]{16,128}$/i.test(uri.searchParams.get('secret') ?? '')) return null;
      return { kind: 'enrollment', challengeId, expiresAt, method: 'totp', setupUri };
    } catch { return null; }
  }
  if (item.kind === 'challenge' && (item.method === 'sms' || item.method === 'totp') && typeof item.canResend === 'boolean') {
    if (item.method === 'totp' && item.canResend) return null;
    const maskedDestination = label(item.maskedDestination, 100);
    if (item.maskedDestination !== undefined && (item.method !== 'sms' || !maskedDestination)) return null;
    return { kind: 'challenge', challengeId, expiresAt, method: item.method, canResend: item.canResend,
      ...(maskedDestination ? { maskedDestination } : {}) };
  }
  return null;
}
