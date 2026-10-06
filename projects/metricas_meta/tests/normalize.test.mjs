import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNormalizedPeriods, normalizeMetaSnapshot } from '../src/normalize.mjs';

const window = { kind: 'weekly', current: { start: '2026-07-27', end: '2026-08-02' } };

test('normalizes posts, separates organic and paid metrics, and totals safe pairs', () => {
  const snapshot = normalizeMetaSnapshot({
    window,
    collectedAt: '2026-08-03T10:00:00.000Z',
    posts: [{ id: 'media-1', timestamp: '2026-08-01T10:00:00Z', permalink: 'https://instagram.test/p/1', media_type: 'IMAGE', caption: 'Hello' }],
    organicInsights: [{ media_id: 'media-1', impressions: '10', likes: 2 }],
    paidInsights: [{ ad_id: 'ad-1', promoted_object: { instagram_media_id: 'media-1' }, impressions: '5', likes: 1 }],
  });

  assert.deepEqual(snapshot.posts[0].organic, { impressions: 10, likes: 2 });
  assert.deepEqual(snapshot.posts[0].paid, { impressions: 5, likes: 1 });
  assert.deepEqual(snapshot.posts[0].total, { impressions: 15, likes: 3 });
  assert.deepEqual(snapshot.posts[0].caption, { hasText: true, length: 5 });
  assert.deepEqual(snapshot.window, window);
  assert.equal(snapshot.collectedAt, '2026-08-03T10:00:00.000Z');
});

test('keeps unavailable, malformed, negative, and unmatched values null', () => {
  const snapshot = normalizeMetaSnapshot({
    posts: [{ id: 'media-1', caption: null }],
    organicInsights: [{ media_id: 'media-1', impressions: undefined, reach: 'not-a-number', likes: -1 }],
    paidInsights: [{ ad_id: 'ad-1', impressions: 5 }],
  });

  assert.deepEqual(snapshot.posts[0].organic, { impressions: null, reach: null, likes: null });
  assert.deepEqual(snapshot.posts[0].paid, {});
  assert.deepEqual(snapshot.posts[0].total, { impressions: null, reach: null, likes: null });
  assert.equal(snapshot.correlations.paid_unmatched.length, 1);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('malformed metric')));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('negative metric rejected')));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('paid_unmatched')));
});

test('rejects whitespace and boolean metrics, including invalid paid values', () => {
  const snapshot = normalizeMetaSnapshot({
    posts: [{ id: 'media-1' }],
    organicInsights: [{ media_id: 'media-1', impressions: '  ', reach: true }],
    paidInsights: [{ ad_id: 'ad-1', promoted_object: { instagram_media_id: 'media-1' }, impressions: 'bad', reach: -3 }],
  });

  assert.deepEqual(snapshot.posts[0].organic, { impressions: null, reach: null });
  assert.deepEqual(snapshot.posts[0].paid, { impressions: null, reach: null });
  assert.deepEqual(snapshot.posts[0].total, { impressions: null, reach: null });
  assert.ok(snapshot.warnings.some((warning) => warning.includes('impressions: unavailable metric')));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('organic.reach: malformed metric')));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('paid.impressions: malformed metric')));
  assert.ok(snapshot.warnings.some((warning) => warning.includes('paid.reach: negative metric rejected')));
});

test('warns when a metric is unavailable', () => {
  const snapshot = normalizeMetaSnapshot({
    posts: [{ id: 'media-1' }],
    organicInsights: [{ media_id: 'media-1', impressions: null, reach: undefined }],
  });

  assert.deepEqual(snapshot.posts[0].organic, { impressions: null, reach: null });
  assert.equal(snapshot.warnings.filter((warning) => warning.includes('unavailable metric')).length, 2);
});

test('normalizes actual Meta nested insight payloads and uses them in period deltas', () => {
  const current = normalizeMetaSnapshot({
    posts: [{ id: 'media-1' }],
    organicInsights: [
      { media_id: 'media-1', name: 'reach', values: [{ value: 123, end_time: '2026-08-02T07:00:00+0000' }] },
      { media_id: 'media-1', name: 'impressions', values: [{ value: '240', end_time: '2026-08-02T07:00:00+0000' }] },
    ],
  });
  const previous = normalizeMetaSnapshot({
    posts: [{ id: 'media-1' }],
    organicInsights: [
      { media_id: 'media-1', name: 'reach', values: [{ value: 100, end_time: '2026-07-26T07:00:00+0000' }] },
      { media_id: 'media-1', name: 'impressions', values: [{ value: 200, end_time: '2026-07-26T07:00:00+0000' }] },
    ],
  });

  assert.deepEqual(current.posts[0].organic, { reach: 123, impressions: 240 });
  assert.deepEqual(compareNormalizedPeriods(current, previous).delta.organic, { reach: 23, impressions: 40 });
});

test('preserves unavailable nested values as null with warnings', () => {
  const snapshot = normalizeMetaSnapshot({
    posts: [{ id: 'media-1' }],
    organicInsights: [
      { media_id: 'media-1', name: 'reach', values: [{ value: null, end_time: '2026-08-02T07:00:00+0000' }] },
      { media_id: 'media-1', name: 'saves', values: [] },
    ],
  });

  assert.deepEqual(snapshot.posts[0].organic, { reach: null, saves: null });
  assert.equal(snapshot.warnings.filter((warning) => warning.includes('unavailable metric')).length, 2);
});

test('normalizes monthly account insights and derives follower growth without inventing values', () => {
  const snapshot = normalizeMetaSnapshot({
    accountEnabled: true,
    accountInsights: [
      { requested_metric: 'reach', values: [{ value: 100 }, { value: 50 }] },
      { requested_metric: 'follows', values: [{ value: 8 }] },
      { requested_metric: 'unfollows', values: [{ value: 3 }] },
      { requested_metric: 'total_interactions', values: [{ value: null }] },
    ],
  });
  assert.equal(snapshot.account.reach, 150);
  assert.equal(snapshot.account.follower_growth, 5);
  assert.equal(snapshot.account.total_interactions, null);
  assert.equal(snapshot.account.website_clicks, null);
  assert.ok(snapshot.warnings.some((warning) => warning.includes('account.total_interactions')));
});

test('normalizes the Graph API follows_and_unfollows account shape', () => {
  const snapshot = normalizeMetaSnapshot({
    accountEnabled: true,
    accountInsights: [{ requested_metric: 'follows_and_unfollows', values: [{ value: { follows: 9, unfollows: 4 } }] }],
  });
  assert.equal(snapshot.account.follows, 9);
  assert.equal(snapshot.account.unfollows, 4);
  assert.equal(snapshot.account.follower_growth, 5);
});
