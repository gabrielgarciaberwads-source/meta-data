import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaClient } from '../src/meta-client.mjs';

const token = 'secret-token';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (body instanceof Error) throw body;
      return body;
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
}

test('sends GET with bearer authorization and no token in the URL', async () => {
  let request;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return response(200, { id: '1' });
    },
  });

  assert.deepEqual(await client.get('/me', { fields: 'id,username' }), { id: '1' });
  assert.match(request.url, /^https:\/\/graph\.facebook\.com\/v23\.0\/me\?/);
  assert.equal(request.options.method, 'GET');
  assert.equal(request.options.headers.Authorization, `Bearer ${token}`);
  assert.doesNotMatch(request.url, /secret-token|access_token/i);
});

test('rejects access tokens in query parameters before fetching', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {});
    },
  });

  await assert.rejects(client.get('/me', { access_token: 'another-token' }), /token query parameters/);
  assert.equal(calls, 0);
});

test('rejects every non-GET method before fetching', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {});
    },
  });

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await assert.rejects(client.get('/me', { method }), /only allows GET/);
  }
  assert.equal(calls, 0);
});

test('concatenates Graph pagination', async () => {
  const urls = [];
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async (url) => {
      urls.push(String(url));
      return urls.length === 1
        ? response(200, { data: [{ id: '1' }], paging: { next: 'https://graph.facebook.com/v23.0/me?after=2' } })
        : response(200, { data: [{ id: '2' }] });
    },
  });

  assert.deepEqual(await client.getAll('/me'), [{ id: '1' }, { id: '2' }]);
  assert.equal(urls.length, 2);
});

test('accepts Meta pagination URLs without repeating the version prefix', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: 'secret-token', graphVersion: 'v23.0',
    fetchImpl: async (url) => {
      calls += 1;
      if (calls === 1) return response(200, { data: [{ id: 'one' }], paging: { next: 'https://graph.facebook.com/me/media?after=next' } });
      return response(200, { data: [{ id: 'two' }] });
    },
  });
  assert.deepEqual(await client.getAll('/me/media'), [{ id: 'one' }, { id: 'two' }]);
});

test('rejects token query parameters in pagination URLs before fetching them', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {
        data: [{ id: '1' }],
        paging: { next: 'https://graph.facebook.com/v23.0/me?access_token=leaked' },
      });
    },
  });

  await assert.rejects(client.getAll('/me'), /token query parameters/);
  assert.equal(calls, 1);
});

test('keeps relative paths inside the graph version namespace', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => {
      calls += 1;
      return response(200, {});
    },
  });

  await assert.rejects(client.get('../me'), /namespace/);
  await assert.rejects(client.get('/v23.0/../me'), /namespace/);
  assert.equal(calls, 0);
});

test('retries a 429 once and then succeeds', async () => {
  let calls = 0;
  const delays = [];
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    sleepImpl: async (delay) => delays.push(delay),
    fetchImpl: async () => (++calls === 1 ? response(429, {}) : response(200, { ok: true })),
  });

  assert.deepEqual(await client.get('/me'), { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [250]);
});

test('does not retry authentication errors', async () => {
  let calls = 0;
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => {
      calls += 1;
      return response(401, { error: 'invalid token' });
    },
  });

  await assert.rejects(client.get('/me'), /invalid token/);
  assert.equal(calls, 1);
});

test('redacts tokens from thrown errors', async () => {
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => response(500, `Bearer ${token}`),
  });

  await assert.rejects(client.get('/me'), (error) => {
    assert.match(error.message, /REDACTED/);
    assert.doesNotMatch(error.message, new RegExp(token));
    return true;
  });
});

test('redacts broad credential-shaped fields from errors', async () => {
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => response(400, 'token=one access_token=two auth_token=three authorization=four api_key=five secret=six values=seven'),
  });
  await assert.rejects(client.get('/me'), (error) => {
    assert.doesNotMatch(error.message, /one|two|three|four|five|six|seven/);
    assert.match(error.message, /REDACTED/);
    return true;
  });
});

test('redacts tokens from response body read errors', async () => {
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      async text() {
        throw new Error(`body contains ${token}`);
      },
    }),
  });

  await assert.rejects(client.get('/me'), (error) => {
    assert.match(error.message, /REDACTED/);
    assert.doesNotMatch(error.message, new RegExp(token));
    return true;
  });
});

test('stops retrying after three transient attempts', async () => {
  let calls = 0;
  const delays = [];
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    sleepImpl: async (delay) => delays.push(delay),
    fetchImpl: async () => {
      calls += 1;
      return response(503, {});
    },
  });

  await assert.rejects(client.get('/me'), /request failed \(503\)/);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [250, 500]);
});

test('rejects an untrusted pagination host', async () => {
  const client = createMetaClient({
    accessToken: token,
    graphVersion: 'v23.0',
    fetchImpl: async () => response(200, {
      data: [{ id: '1' }],
      paging: { next: 'https://evil.example.com/v23.0/me?after=2' },
    }),
  });

  await assert.rejects(client.getAll('/me'), /untrusted URL/);
});
