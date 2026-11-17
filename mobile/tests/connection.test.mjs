import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { probeScm, resolveConnection } from '../src/scm/connection.ts';

let server;
let root;
const seen = [];
before(async () => {
  server = createServer((request, response) => {
    seen.push({ url: request.url, method: request.method, cookie: request.headers.cookie });
    if (request.url === '/hang/') return;
    if (request.url === '/denied/') response.statusCode = 403;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(request.url === '/SCM/' ? '<!doctype html><title>SCM Login</title>' : '<title>Other app</title>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  root = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
});

test('normalizes the context path and rejects credential-bearing or insecure release URLs', () => {
  assert.equal(resolveConnection('https://scm.example.com/SCM', false).url.href, 'https://scm.example.com/SCM/');
  for (const value of ['http://127.0.0.1/SCM/', 'https://name:pass@scm.example.com/', 'https://scm.example.com/?token=secret', 'file:///tmp/SCM']) {
    assert.deepEqual(resolveConnection(value, false), { kind: 'invalid' });
  }
  assert.deepEqual(resolveConnection(undefined, false), { kind: 'unconfigured' });
  assert.equal(resolveConnection('http://10.0.2.2:8080/SCM/', true).kind, 'configured');
});

test('checks the public path using only GET and rejects an unrelated healthy page', async () => {
  assert.deepEqual(await probeScm(new URL(`${root}/SCM/`)), { kind: 'reachable' });
  assert.deepEqual(seen.find((item) => item.url === '/SCM/'), { url: '/SCM/', method: 'GET', cookie: undefined });
  assert.deepEqual(await probeScm(new URL(`${root}/other/`)), { kind: 'not-scm' });
  assert.deepEqual(await probeScm(new URL(`${root}/denied/`)), { kind: 'http', status: 403 });
});

test('handles a hung request and caller cancellation separately', async () => {
  assert.deepEqual(await probeScm(new URL(`${root}/hang/`), { timeoutMs: 30 }), { kind: 'timeout' });
  const controller = new AbortController();
  const probe = probeScm(new URL(`${root}/hang/`), { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await probe, { kind: 'cancelled' });
});

test('rejects reports from another origin even when their title matches', async () => {
  const response = new Response('<title>SCM Login</title>', { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(response, 'url', { value: 'https://another.example/SCM/' });
  assert.deepEqual(await probeScm(new URL(`${root}/SCM/`), { fetcher: async () => response }), { kind: 'not-scm' });
});
