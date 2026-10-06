const ID_FIELDS = [
  'media_id',
  'mediaId',
  'instagram_media_id',
  'instagramMediaId',
  'post_id',
  'postId',
  'external_id',
  'externalId',
];

const NESTED_ID_FIELDS = [
  'object_id',
  'objectId',
  'object_story_id',
  'objectStoryId',
  'effective_object_story_id',
  'effectiveObjectStoryId',
];

function collectIds(value, ids = new Set()) {
  if (!value || typeof value !== 'object') return ids;

  for (const field of ID_FIELDS) {
    if (typeof value[field] === 'string' && value[field]) ids.add(value[field]);
  }
  for (const field of NESTED_ID_FIELDS) {
    if (typeof value[field] === 'string' && value[field]) ids.add(value[field]);
  }

  for (const field of ['creative', 'promoted_object', 'promotedObject']) {
    collectIds(value[field], ids);
  }
  return ids;
}

export function correlatePaidToMedia({ ads = [], posts = [] } = {}) {
  const postsById = new Map();
  for (const post of Array.isArray(posts) ? posts : []) {
    if (typeof post?.externalId === 'string' && post.externalId) {
      const candidates = postsById.get(post.externalId) ?? [];
      candidates.push(post);
      postsById.set(post.externalId, candidates);
    }
  }

  const matches = [];
  const unmatched = [];
  for (const ad of Array.isArray(ads) ? ads : []) {
    const ids = [...collectIds(ad)];
    const matchingIds = ids.filter((id) => postsById.has(id));
    const candidates = matchingIds.flatMap((id) => postsById.get(id));

    if (matchingIds.length === 1 && candidates.length === 1) {
      const post = candidates[0];
      matches.push({
        externalId: post.externalId,
        post,
        ad,
      });
    } else {
      unmatched.push({
        type: 'paid_unmatched',
        ad,
        reason: matchingIds.length > 1 || candidates.length > 1
          ? 'ambiguous_identifier'
          : 'no_explicit_media_identifier',
      });
    }
  }

  return { matches, unmatched };
}
