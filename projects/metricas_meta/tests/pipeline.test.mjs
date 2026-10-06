import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { persistSnapshot, runPipeline } from '../src/pipeline.mjs';

const window = { kind: 'weekly', current: { start: '2026-07-27', end: '2026-08-03' }, previous: null };

function fakeMeta() {
  return {
    async getAll(path) {
      if (path.endsWith('/media')) return [{ id: 'media-1', timestamp: '2026-08-01T00:00:00Z', caption: 'hello' }];
      if (path.includes('/insights')) return [{ media_id: 'media-1', impressions: 10 }];
      throw new Error(`unexpected endpoint ${path}`);
    },
  };
}

test('writes a complete token-free snapshot before Presenton generation', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  const order = [];
  try {
    const runId = '20260803120000';
    const result = await runPipeline({
      metaClient: fakeMeta(),
      config: { metaIgUserId: 'ig-user-id', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir: dataDir },
      window,
      collectedAt: '2026-08-03T12:00:00.000Z',
      runId,
      persistSnapshotImpl: async (input) => {
        const snapshotPath = await persistSnapshot(input);
        order.push('snapshot');
        return snapshotPath;
      },
      presentonClient: { async generate() {
        order.push('presenton');
        order.push(await readFile(join(dataDir, 'snapshots', `${runId}.json`), 'utf8'));
      } },
    });
    assert.deepEqual(order.slice(0, 2), ['snapshot', 'presenton']);
    assert.match(order[2], /"source": "meta"/);
    for (const key of ['source', 'account', 'collectedAt', 'window', 'posts', 'metrics', 'correlations', 'warnings']) {
      assert.ok(Object.hasOwn(result.snapshot, key), key);
    }
    assert.doesNotMatch(order[2], /secret-token|accessToken|Bearer/i);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('collects the prior weekly period and persists deltas', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  const calls = [];
  try {
    const result = await runPipeline({
      metaClient: {
        async getAll(path, query) {
          calls.push([path, query]);
           if (path.endsWith('/media')) return [
             { id: 'old', timestamp: '2026-07-20T00:00:00Z' },
             { id: 'new', timestamp: '2026-07-27T00:00:00Z' },
           ];
          if (path === '/new/insights') return [{ impressions: 10 }];
          if (path === '/old/insights') return [{ impressions: 4 }];
          if (path.includes('ad-account')) return [];
          return [];
        },
      },
      config: { metaIgUserId: 'ig-user-id', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir: dataDir },
      window: { kind: 'weekly', current: { start: '2026-07-27', end: '2026-08-03' }, previous: { start: '2026-07-20', end: '2026-07-27' } },
      presentonClient: null,
    });
    assert.equal(result.snapshot.periods.previous.posts[0].organic.impressions, 4);
    assert.equal(result.snapshot.comparison.delta.organic.impressions, 6);
    assert.equal(result.briefing.json.comparison.delta.organic.impressions, 6);
    assert.ok(calls.some(([path]) => path === '/old/insights'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('preserves a warning snapshot when Meta responses are empty or fail', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  try {
    const result = await runPipeline({
      metaClient: { async getAll(path) { if (path.endsWith('/media')) return []; throw new Error('permission denied: access_token=secret-token'); } },
      config: { metaIgUserId: 'ig-user-id', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir: dataDir },
      window,
      presentonClient: null,
    });
     assert.ok(result.snapshot.warnings.some((warning) => /no media|permission/i.test(warning)));
    assert.ok(result.briefing.json.warnings.length);
    assert.doesNotMatch(JSON.stringify(result.snapshot), /secret-token/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('persists atomically and cleans the temporary snapshot after a failed rename', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  const calls = [];
  let temporaryPath;
  const fsImpl = {
    mkdir,
    async writeFile(path, ...args) {
      temporaryPath = path;
      calls.push(['writeFile', path]);
      return writeFile(path, ...args);
    },
    async rename(from, to) {
      calls.push(['rename', from, to]);
      return rename(from, to);
    },
    unlink,
  };
  try {
    const finalPath = await persistSnapshot({ dataDir, runId: 'atomic', snapshot: { ok: true }, fsImpl });
    assert.deepEqual(calls.map(([name]) => name), ['writeFile', 'rename']);
    assert.equal(calls[1][1], temporaryPath);
    assert.equal(calls[1][2], finalPath);
    await access(finalPath);

    const failingFs = {
      ...fsImpl,
      async rename(from, to) {
        calls.push(['failed-rename', from, to]);
        throw new Error('rename failed');
      },
    };
    await assert.rejects(
      persistSnapshot({ dataDir, runId: 'cleanup', snapshot: { ok: true }, fsImpl: failingFs }),
      /rename failed/,
    );
    const failedTemporaryPath = calls.at(-1)[1];
    await assert.rejects(access(failedTemporaryPath), { code: 'ENOENT' });
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('Presenton failure preserves snapshot, briefing, and previous output', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  const outputDir = await mkdtemp(join(tmpdir(), 'instagram-output-'));
  try {
    const runId = '20260803120000';
    const briefingPath = join(dataDir, 'briefing.json');
    const outputPath = join(outputDir, 'previous.pptx');
    await writeFile(briefingPath, 'existing briefing');
    await writeFile(outputPath, 'previous presentation');
    const events = [];
    const persistRealBriefing = async ({ runId: briefingRunId, briefing, dataDir: briefingDataDir }) => {
      events.push('briefing');
      const briefingDir = join(briefingDataDir, 'briefings');
      await mkdir(briefingDir, { recursive: true });
      await writeFile(join(briefingDir, `${briefingRunId}.json`), JSON.stringify(briefing.json));
    };
    await assert.rejects(() => runPipeline({
      metaClient: fakeMeta(),
      config: { metaIgUserId: 'ig-user-id', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir },
      window,
      collectedAt: '2026-08-03T12:00:00.000Z',
      runId,
      buildBriefing: () => ({ json: { runId }, markdown: '# briefing' }),
      persistBriefing: persistRealBriefing,
      presentonClient: { async generate() {
        events.push('presenton');
        throw new Error('Presenton failed with secret-token');
      } },
    }), (error) => {
      assert.match(error.message, /Presenton failed/);
      assert.doesNotMatch(error.message, /secret-token/);
      return true;
    });
    assert.deepEqual(events, ['briefing', 'presenton']);
    assert.equal(await readFile(join(dataDir, 'briefings', `${runId}.json`), 'utf8'), JSON.stringify({ runId }));
    assert.equal((await readFile(join(dataDir, 'snapshots', `${runId}.json`), 'utf8')).includes('secret-token'), false);
    assert.equal(await readFile(briefingPath, 'utf8'), 'existing briefing');
    assert.equal(await readFile(outputPath, 'utf8'), 'previous presentation');
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('simulates the complete pipeline and returns every generated path', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-pipeline-'));
  const outputDir = await mkdtemp(join(tmpdir(), 'instagram-output-'));
  const events = [];
  try {
    const result = await runPipeline({
      metaClient: {
        async getAll(path) {
          if (path.endsWith('/media')) return [{ id: 'media-1', timestamp: '2026-08-01T00:00:00Z', caption: 'hello', media_type: 'IMAGE' }];
          if (path.includes('/insights')) return [{ media_id: 'media-1', impressions: 10 }];
          return [];
        },
      },
      presentonClient: { async generate(input) {
        events.push('presenton-generation');
        assert.equal(typeof input.content, 'string');
        assert.equal(Array.isArray(input.slidesMarkdown), true);
        assert.equal(input.slidesMarkdown.length, 8);
        const path = join(input.outputDir, `${input.runId}-weekly.pptx`);
        await writeFile(path, 'fake presentation');
        return { presentationId: 'presentation-1', outputPath: path };
      } },
      config: { metaIgUserId: 'ig-user-id', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir, presentonTemplate: 'general' },
      window,
      collectedAt: '2026-08-03T12:00:00.000Z',
      runId: '20260803120000',
      onEvent: (event) => events.push(event),
    });
    assert.ok(result.snapshotPath.endsWith('/20260803120000.json') || result.snapshotPath.endsWith('\\20260803120000.json'));
    assert.ok(result.briefingPaths.json.endsWith('/20260803120000.json') || result.briefingPaths.json.endsWith('\\20260803120000.json'));
    assert.ok(result.briefingPaths.markdown.endsWith('/20260803120000.md') || result.briefingPaths.markdown.endsWith('\\20260803120000.md'));
    assert.equal(await readFile(result.presentation.outputPath, 'utf8'), 'fake presentation');
    assert.deepEqual(events, [
      'meta-collection',
      'normalization',
      'snapshot-persistence',
      'briefing-persistence',
      'presenton-generation',
    ]);
    assert.equal((await readFile(result.snapshotPath, 'utf8')).includes('secret-token'), false);
    assert.equal((await readFile(result.briefingPaths.json, 'utf8')).includes('secret-token'), false);
    assert.equal((await readFile(result.briefingPaths.markdown, 'utf8')).includes('secret-token'), false);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('collects account insights and sends eleven slides only for monthly runs', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'instagram-monthly-'));
  const calls = [];
  try {
    const result = await runPipeline({
      metaClient: {
        async getAll(path, query) {
          calls.push([path, query]);
          if (path.endsWith('/media')) return [{ id: 'media-1', timestamp: '2026-08-01T00:00:00Z' }];
          if (path === '/media-1/insights') return [{ media_id: 'media-1', impressions: 10 }];
          if (path === '/ig-user/insights' && query.metric === 'reach') return [{ requested_metric: 'reach', values: [{ value: 100 }] }];
          if (path === '/ig-user/insights') throw new Error('unsupported metric');
          return [];
        },
      },
      presentonClient: { async generate(input) {
        assert.equal(input.nSlides, 11);
        assert.equal(input.slidesMarkdown.length, 11);
        return { outputPath: join(dataDir, 'monthly.pptx') };
      } },
      config: { metaIgUserId: 'ig-user', metaAdAccountId: 'ad-account-id', metaAccessToken: 'secret-token', dataDir, outputDir: dataDir },
      window: { kind: 'monthly', current: { start: '2026-07-04', end: '2026-08-02' }, previous: null },
    });
    assert.equal(result.snapshot.periods.current.account.reach, 100);
    assert.ok(result.snapshot.warnings.some((warning) => warning.includes('account metric follower_count unavailable')));
    assert.ok(calls.some(([path, query]) => path === '/ig-user/insights' && query.metric === 'reach'));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
