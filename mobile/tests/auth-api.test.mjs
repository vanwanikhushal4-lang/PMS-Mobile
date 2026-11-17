import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFixture } from '../../tools/scm_auth_fixture.mjs';
import { AuthError, createAuthClient, resolveAuthConfig, restoreGrant } from '../src/scm/auth-api.ts';

const credentials = (username) => ({ companyCode: 'QA-OPS', username, password: 'SCM-qa-only-2026' });
async function fixture(t, options) {
  const server = createFixture(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const config = resolveAuthConfig(`http://127.0.0.1:${server.address().port}/mobile/v1/auth/`, true);
  return { client: createAuthClient(config), config };
}

test('isolates loopback fixtures from production and rejects ambiguous endpoints', () => {
  for (const url of ['http://127.0.0.1:8084/mobile/v1/auth/', 'https://scm.test/', 'https://u:p@scm.test/mobile/v1/auth/', 'https://scm.test/mobile/v1/auth/?x=3']) assert.equal(resolveAuthConfig(url), null);
  assert.equal(resolveAuthConfig('http://192.168.0.3/mobile/v1/auth/', true), null);
  assert.equal(resolveAuthConfig('https://scm.test/SCM/mobile/v1/auth').url.href, 'https://scm.test/SCM/mobile/v1/auth/');
});

test('sign-in, server validation and logout require the same live grant', async (t) => {
  const { client, config } = await fixture(t);
  assert.equal((await client.signIn({ ...credentials('local'), password: 'wrong' })).reason, 'invalid-credentials');
  const result = await client.signIn(credentials('local'));
  assert.equal(result.kind, 'authenticated');
  const stored = JSON.stringify({ endpoint: config.url.href, ...result.grant });
  assert.deepEqual(restoreGrant(stored, config.url.href), result.grant);
  assert.equal(restoreGrant(stored, 'https://other.invalid/'), null);
  assert.equal((await client.session(result.grant)).identity.role, 'Sales Manager');
  await client.signOut(result.grant);
  await assert.rejects(() => client.session(result.grant), { code: 'expired' });
});

test('an SMS resend retires the previous challenge and a verified code cannot replay', async (t) => {
  const { client } = await fixture(t);
  const first = await client.signIn(credentials('sms'));
  assert.equal(first.kind, 'challenge');
  await assert.rejects(() => client.session({ sessionToken: first.challengeId, expiresAt: first.expiresAt }), { code: 'expired' });
  const next = await client.resend(first.challengeId);
  assert.equal(next.kind, 'challenge');
  assert.notEqual(next.challengeId, first.challengeId);
  assert.equal((await client.verify(first.challengeId, '246810')).reason, 'expired');
  assert.equal((await client.verify(next.challengeId, '111111')).reason, 'invalid-code');
  assert.equal((await client.verify(next.challengeId, '246810')).kind, 'authenticated');
  assert.equal((await client.verify(next.challengeId, '246810')).reason, 'expired');
});

test('enrollment returns no session, then becomes a returning authenticator flow', async (t) => {
  const { client } = await fixture(t);
  const setup = await client.signIn(credentials('enroll'));
  assert.equal(setup.kind, 'enrollment');
  assert.match(setup.setupUri, /^otpauth:\/\/totp\//);
  assert.equal((await client.verify(setup.challengeId, '246810')).kind, 'authenticated');
  const next = await client.signIn(credentials('enroll'));
  assert.equal(next.kind, 'challenge');
  assert.equal(next.method, 'totp');
  assert.equal(next.canResend, false);
});

test('email recovery requires a verified account-bound grant and revokes old sessions', async (t) => {
  const { client } = await fixture(t);
  const active = await client.signIn(credentials('local'));
  const request = { companyCode: 'QA-OPS', channel: 'email' };
  const fake = await client.startRecovery({ ...request, username: 'unknown' });
  const real = await client.startRecovery({ ...request, username: 'local' });
  assert.equal(fake.kind, real.kind);
  assert.equal((await client.verifyRecovery(fake.challengeId, '246810')).reason, 'invalid-code');
  assert.equal((await client.completeRecovery(real.challengeId, 'New-password')).reason, 'expired');
  const verified = await client.verifyRecovery(real.challengeId, '246810');
  assert.equal(verified.kind, 'recovery-verified');
  assert.equal((await client.completeRecovery(verified.resetGrant, 'Too-short')).reason, 'password-policy');
  assert.equal((await client.completeRecovery(verified.resetGrant, 'New-password')).kind, 'password-changed');
  assert.equal((await client.completeRecovery(verified.resetGrant, 'Other-password')).reason, 'expired');
  await assert.rejects(() => client.session(active.grant), { code: 'expired' });
  assert.equal((await client.signIn(credentials('local'))).reason, 'invalid-credentials');
  assert.equal((await client.signIn({ ...credentials('local'), password: 'New-password' })).kind, 'authenticated');
});

test('expired challenges fail on the service and redirect protection is required', async (t) => {
  let now = Date.now();
  const { client, config } = await fixture(t, { clock: () => now });
  const first = await client.signIn(credentials('totp'));
  now += 181_000;
  assert.equal((await client.verify(first.challengeId, '246810')).reason, 'expired');
  let init;
  const redirected = createAuthClient(config, async (_, options) => {
    init = options;
    return { url: 'https://other.invalid/', ok: true, status: 200, headers: new Headers(), json: async () => ({}) };
  });
  await assert.rejects(() => redirected.signIn(credentials('local')), (error) => error instanceof AuthError && error.code === 'bad-response');
  assert.equal(init.redirect, 'error');
  assert.equal(init.credentials, 'omit');
});

test('an unsuccessful sign-out is never reported as confirmed revocation', async (t) => {
  const { client, config } = await fixture(t);
  const active = await client.signIn(credentials('local'));
  const refusal = createAuthClient(config, async (url) => ({ url, ok: false, status: 403,
    headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ kind: 'rejected', reason: 'account-unavailable' }) }));
  await assert.rejects(() => refusal.signOut(active.grant), { code: 'bad-response' });
  assert.equal((await client.session(active.grant)).kind, 'authenticated');
});
