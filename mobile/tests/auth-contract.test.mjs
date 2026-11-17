import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeAuthStep } from '../src/scm/auth-contract.ts';

const now = 1_790_000_000_000;
const expiresAt = now + 2 * 60 * 1000;
const challengeId = 'ua0qx2aFAE8G2WzqoM0W2a';
const identity = { username: 'qa-user', displayName: 'QA User', companyCode: 'demo', companyName: 'Test Co', role: 'Engineer', designation: '', capabilities: ['tasks.read'] };

test('only a complete authenticated response produces a mobile identity', () => {
  assert.deepEqual(decodeAuthStep({ kind: 'authenticated', identity, expiresAt }, now), { kind: 'authenticated', identity, expiresAt });
  for (const payload of [null, { STATUS: 'Pass' }, { kind: 'authenticated', expiresAt },
    { kind: 'authenticated', identity: { ...identity, companyCode: '' }, expiresAt },
    { kind: 'authenticated', identity: { ...identity, capabilities: [42] }, expiresAt },
    { kind: 'authenticated', identity, expiresAt: now }]) assert.equal(decodeAuthStep(payload, now), null);
});

test('SMS challenge remains pending and does not expose account grants', () => {
  const challenge = { kind: 'challenge', challengeId, expiresAt, method: 'sms', canResend: true, maskedDestination: '•••042' };
  assert.deepEqual(decodeAuthStep({ ...challenge, identity }, now), challenge);
  assert.equal(decodeAuthStep({ ...challenge, challengeId: 'x' }, now), null);
  assert.equal(decodeAuthStep({ ...challenge, expiresAt: now + 16 * 60_000 }, now), null);
  assert.equal(decodeAuthStep({ ...challenge, method: 'totp' }, now), null);
});

test('enrollment only accepts an authenticator setup URI', () => {
  const enrollment = { kind: 'enrollment', challengeId, expiresAt, method: 'totp', setupUri: 'otpauth://totp/SCM:test?secret=AAAAAAAAAAAAAAAA' };
  assert.deepEqual(decodeAuthStep(enrollment, now), enrollment);
  assert.equal(decodeAuthStep({ ...enrollment, setupUri: 'https://example.test/setup' }, now), null);
  assert.equal(decodeAuthStep({ ...enrollment, setupUri: 'otpauth://totp/SCM:test' }, now), null);
});

test('unrecognized failures cannot be interpreted as sessions', () => {
  assert.deepEqual(decodeAuthStep({ kind: 'rejected', reason: 'invalid-code', identity }, now), { kind: 'rejected', reason: 'invalid-code' });
  assert.equal(decodeAuthStep({ kind: 'rejected', reason: 'unknown' }, now), null);
});
