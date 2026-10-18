const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ServiceSessionManager, SERVICE_SESSION_KEY } = require('../.test-build/serviceSessionCore');
const { accountScope, storageKey, setStorageScope, captureStorageKey } = require('../.test-build/storageScope');
const { BackgroundPathBuffer } = require('../.test-build/pathBuffer');

const base = 'https://golf.example.test/api';
const healthy = { service: 'smart-golf-gps', apiVersion: '1', authentication: 'bearer', databaseReady: true, status: 'ok' };
const login = () => ({ token: 'synthetic-test-token-with-enough-length', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 86400000).toISOString(),
  user: { id: 'test-account', email: 'golfer@example.test', name: 'Synthetic player' } });
function fixture() {
  const entries = new Map(), calls = [], scopes = [];
  const store = { secureGet: async (key, fallback) => entries.get(key) || fallback,
    secureSet: async (key, value) => { entries.set(key, value); return true; } };
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/health') ? healthy : url.endsWith('/auth/token') && options.method === 'POST' ? login() : { ok: true }));
  };
  return { entries, calls, scopes, store, fetcher, manager: new ServiceSessionManager(store, fetcher, null, false, scope => scopes.push(scope)) };
}

test('connection check validates service identity and sends no token or password', async () => {
  const f = fixture();
  assert.equal(await f.manager.probe(base), base);
  assert.equal(f.calls[0].options.headers.Authorization, undefined);
  assert.equal(f.calls[0].options.body, undefined);
  assert.equal(f.calls[0].options.redirect, 'error');
  assert.equal(f.entries.size, 0);
});

test('unhealthy, unrelated and HTML endpoints cannot receive sign-in credentials', async () => {
  for (const response of [new Response('<html>Landing page</html>'), new Response(JSON.stringify({ ...healthy, databaseReady: false })),
    new Response(JSON.stringify(healthy), { status: 503 })]) {
    let calls = 0;
    const f = fixture();
    const manager = new ServiceSessionManager(f.store, async () => { calls++; return response; }, null);
    await assert.rejects(manager.signIn(base, 'golfer@example.test', 'test-only-password'));
    assert.equal(calls, 1);
    assert.equal(f.entries.size, 0);
  }
});

test('remote HTTP and credential-bearing API URLs are rejected before fetching', async () => {
  const f = fixture();
  await assert.rejects(f.manager.probe('http://golf.example.test/api'));
  await assert.rejects(f.manager.probe('https://secret:password@golf.example.test/api'));
  assert.equal(f.calls.length, 0);
});

test('sign-in commits one secure session and separates account cache from legacy data', async () => {
  const f = fixture();
  await f.manager.signIn(base, 'golfer@example.test', 'test-only-password');
  assert.equal(f.calls.length, 2);
  assert.equal(f.manager.token, login().token);
  const saved = JSON.parse(f.entries.get(SERVICE_SESSION_KEY));
  assert.equal(saved.apiBase, base);
  assert.equal(saved.user.id, 'test-account');
  assert.equal(JSON.stringify(saved).includes('test-only-password'), false);
  assert.equal(f.scopes.at(-1), accountScope(base, 'test-account'));
});

test('secure-storage failure does not complete sign-in or change the active cache scope', async () => {
  const f = fixture();
  f.store.secureSet = async () => false;
  await assert.rejects(f.manager.signIn(base, 'golfer@example.test', 'test-only-password'), /saved securely/);
  assert.equal(f.manager.session, null);
  assert.equal(f.scopes.length, 0);
});

test('restored credentials remain bound to the API and account; transfers do not reuse caches', async () => {
  const f = fixture();
  await f.manager.signIn(base, 'golfer@example.test', 'test-only-password');
  const manager = new ServiceSessionManager(f.store, f.fetcher, null);
  await manager.restore();
  assert.equal(manager.token, login().token);
  await assert.rejects(manager.signIn('https://other.example.test/api', 'golfer@example.test', 'test-only-password'), /another golf account/);
  await assert.rejects(manager.signIn(base, 'another@example.test', 'test-only-password'), /another golf account/);
  assert.equal(f.calls.filter(c => c.options.method === 'POST').length, 1);
});

test('expired sessions never provide a bearer token', async () => {
  const f = fixture();
  f.entries.set(SERVICE_SESSION_KEY, JSON.stringify({ apiBase: base, ...login(), expiresAt: '2000-01-01T00:00:00Z' }));
  await f.manager.restore();
  assert.equal(f.manager.token, null);
  assert.equal(f.manager.session.user.id, 'test-account');
});

test('sign-out persists token removal, preserves binding, and reports failed remote revocation', async () => {
  const f = fixture();
  await f.manager.signIn(base, 'golfer@example.test', 'test-only-password');
  const manager = new ServiceSessionManager(f.store, async () => { throw new Error('network unavailable'); }, null);
  await manager.restore();
  assert.equal(await manager.signOut(), false);
  assert.equal(manager.token, null);
  assert.equal(JSON.parse(f.entries.get(SERVICE_SESSION_KEY)).token, null);
  assert.equal(manager.scope, 'sg_signed_out:');
  assert.equal(manager.session.user.id, 'test-account');
});

test('malformed saved session is retained for review rather than overwritten', async () => {
  const f = fixture();
  f.entries.set(SERVICE_SESSION_KEY, 'legacy-malformed-record');
  await assert.rejects(f.manager.restore());
  assert.equal(f.entries.get(SERVICE_SESSION_KEY), 'legacy-malformed-record');
});

test('background operations retain captured account namespace after sign-out', async () => {
  const entries = new Map();
  const store = { getItem: async (key, fallback) => entries.get(storageKey(key)) || fallback,
    setItem: async (key, value) => { entries.set(storageKey(key), value); return true; } };
  setStorageScope(accountScope(base, 'test-account'));
  const key = storageKey('sg_bg_path');
  const buffer = new BackgroundPathBuffer(store, key);
  setStorageScope('sg_signed_out:');
  await buffer.append([{ lat: 0, lng: 0, t: 1 }]);
  assert.equal(entries.has('sg_signed_out:sg_bg_path'), false);
  assert.equal(JSON.parse(entries.get(key)).length, 1);
  setStorageScope('');
});

test('queued legacy history stays unassigned after first account connection', async () => {
  setStorageScope('');
  const legacy = captureStorageKey('sg_bg_path');
  setStorageScope(accountScope(base, 'test-account'));
  assert.equal(storageKey(legacy), 'sg_bg_path');
  assert.notEqual(storageKey('sg_bg_path'), 'sg_bg_path');
  setStorageScope('');
});
