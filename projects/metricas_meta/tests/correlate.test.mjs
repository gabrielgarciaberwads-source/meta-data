import test from 'node:test';
import assert from 'node:assert/strict';
import { correlatePaidToMedia } from '../src/correlate.mjs';

test('matches paid data only through an explicit Meta media identifier', () => {
  const posts = [{ externalId: 'media-1' }, { externalId: 'media-2' }];
  const result = correlatePaidToMedia({
    posts,
    ads: [
      { ad_id: 'ad-1', promoted_object: { instagram_media_id: 'media-2' } },
      { ad_id: 'ad-2', caption: 'same caption', impressions: 100 },
    ],
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].externalId, 'media-2');
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.unmatched[0].type, 'paid_unmatched');
});

test('does not invent attribution when identifiers are ambiguous', () => {
  const result = correlatePaidToMedia({
    posts: [{ externalId: 'media-1' }, { externalId: 'media-2' }],
    ads: [{ object_id: 'media-1', creative: { object_story_id: 'media-2' } }],
  });

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched[0].reason, 'ambiguous_identifier');
});

test('does not attribute an identifier shared by duplicate posts', () => {
  const result = correlatePaidToMedia({
    posts: [{ externalId: 'media-1' }, { externalId: 'media-1' }],
    ads: [{ promoted_object: { instagram_media_id: 'media-1' } }],
  });

  assert.equal(result.matches.length, 0);
  assert.equal(result.unmatched[0].reason, 'ambiguous_identifier');
});
