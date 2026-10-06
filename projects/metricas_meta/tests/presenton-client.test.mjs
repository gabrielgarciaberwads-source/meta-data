import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyPresentonExport, createPresentonClient } from '../src/presenton-client.mjs';

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

test('posts the local Presenton payload with bearer auth', async () => {
  let request;
  const client = createPresentonClient({
    baseUrl: 'http://localhost:5000/presenton',
    apiKey: 'secret-key',
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return jsonResponse({ presentation_id: 'pres-1', path: '/exports/pres-1.pptx', edit_path: '/edit/pres-1' });
    },
  });

  const result = await client.generate({
    content: 'content', slidesMarkdown: '# Slides', instructions: 'Use evidence',
    language: 'pt-BR', template: 'general', nSlides: 8, exportAs: 'pptx',
  });
  assert.equal(request.url, 'http://localhost:5000/api/v1/ppt/presentation/generate');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.authorization, 'Bearer secret-key');
  assert.deepEqual(JSON.parse(request.options.body), {
    content: 'content', slides_markdown: ['# Slides'], instructions: 'Use evidence',
    language: 'pt-BR', template: 'general', n_slides: 8, export_as: 'pptx',
  });
  assert.deepEqual(result, {
    presentationId: 'pres-1',
    fileUrl: 'http://localhost:5000/exports/pres-1.pptx',
    editUrl: 'http://localhost:5000/edit/pres-1',
  });
});

test('rejects non-PPTX export formats', async () => {
  const client = createPresentonClient({ baseUrl: 'http://localhost:5000', fetchImpl: async () => { throw new Error('should not fetch'); } });
  await assert.rejects(() => client.generate({ exportAs: 'pdf' }), /exportAs must be pptx/);
});

test('omits authorization when no key is configured and rejects non-loopback before fetch', async () => {
  let calls = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.equal(options.headers.authorization, undefined);
    return jsonResponse({ presentation_id: 'pres-2', path: '/pres-2.pptx' });
  };
  await createPresentonClient({ baseUrl: 'http://127.0.0.1:5000', fetchImpl }).generate({});
  assert.equal(calls, 1);
  assert.throws(
    () => createPresentonClient({ baseUrl: 'https://presenton.example', fetchImpl }),
    /loopback/,
  );
  assert.equal(calls, 1);
});

test('copies a returned local export without contacting hosted URLs', async () => {
  const sourceDir = await mkdtemp(join(tmpdir(), 'presenton-source-'));
  const outputDir = await mkdtemp(join(tmpdir(), 'presenton-output-'));
  const source = join(sourceDir, 'source.pptx');
  await writeFile(source, 'pptx bytes');
  let calls = 0;
  try {
    const client = createPresentonClient({
      baseUrl: 'http://[::1]:5000',
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ presentation_id: 'pres-3', path: source, edit_path: '/edit/pres-3' });
      },
    });
    await client.generate({ outputDir, outputFileName: 'run-3-weekly.pptx' });
    assert.equal(await readFile(join(outputDir, 'run-3-weekly.pptx'), 'utf8'), 'pptx bytes');
    assert.equal(calls, 1);
    await assert.rejects(
      () => copyPresentonExport({ source: 'https://hosted.example/export.pptx', outputDir }),
      /loopback/,
    );
    assert.equal(calls, 1);
  } finally {
    await Promise.all([rm(sourceDir, { recursive: true, force: true }), rm(outputDir, { recursive: true, force: true })]);
  }
});

test('copies a loopback HTTP export with bearer auth and normalizes response aliases', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'presenton-http-output-'));
  const requests = [];
  try {
    const client = createPresentonClient({
      baseUrl: 'http://localhost:5000',
      apiKey: 'download-key',
      fetchImpl: async (url, options) => {
        requests.push({ url: String(url), options });
        if (options.method === 'GET') return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('http pptx') };
        return jsonResponse({ presentation_id: 'pres-alias', file_url: '/exports/pres-alias.pptx', edit_url: '/edit/pres-alias' });
      },
    });
    const result = await client.generate({ outputDir, outputFileName: 'alias.pptx' });
    assert.deepEqual(result, {
      presentationId: 'pres-alias',
      fileUrl: 'http://localhost:5000/exports/pres-alias.pptx',
      editUrl: 'http://localhost:5000/edit/pres-alias',
    });
    assert.equal(requests[1].url, 'http://localhost:5000/exports/pres-alias.pptx');
    assert.equal(requests[1].options.headers.authorization, 'Bearer download-key');
    assert.equal(await readFile(join(outputDir, 'alias.pptx'), 'utf8'), 'http pptx');
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('redacts loopback download errors and handles download timeouts', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'presenton-download-errors-'));
  try {
    const errorClient = createPresentonClient({
      baseUrl: 'http://127.0.0.1:5000', apiKey: 'download-secret',
      fetchImpl: async (_url, options) => options.method === 'GET'
        ? Promise.reject(new Error('download-secret from export service'))
        : jsonResponse({ presentation_id: 'pres-error', path: '/exports/error.pptx' }),
    });
    await assert.rejects(() => errorClient.generate({ outputDir }), (error) => {
      assert.match(error.message, /REDACTED/);
      assert.doesNotMatch(error.message, /download-secret/);
      return true;
    });

    const timeoutClient = createPresentonClient({
      baseUrl: 'http://[::1]:5000', timeoutMs: 1,
      fetchImpl: async (_url, options) => {
        if (options.method !== 'GET') return jsonResponse({ presentation_id: 'pres-timeout', path: '/exports/timeout.pptx' });
        return new Promise((_, reject) => options.signal.addEventListener('abort', () => {
          const error = new Error('export timeout'); error.name = 'AbortError'; reject(error);
        }));
      },
    });
    await assert.rejects(() => timeoutClient.generate({ outputDir }), /export download timed out/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('redacts keys and handles timeouts and HTTP errors', async () => {
  const timeoutClient = createPresentonClient({
    baseUrl: 'http://localhost:5000', apiKey: 'secret-key', timeoutMs: 1,
    fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { const error = new Error('secret-key leaked'); error.name = 'AbortError'; reject(error); });
    }),
  });
  await assert.rejects(() => timeoutClient.generate({}), /timed out/);

  const errorClient = createPresentonClient({
    baseUrl: 'http://localhost:5000', apiKey: 'secret-key',
    fetchImpl: async () => jsonResponse({ error: 'Bearer secret-key' }, 500),
  });
  await assert.rejects(() => errorClient.generate({}), (error) => {
    assert.match(error.message, /REDACTED/);
    assert.doesNotMatch(error.message, /secret-key/);
    return true;
  });
});
