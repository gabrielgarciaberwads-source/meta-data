import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('schema preserves the isolated meta_raw contract', async () => {
  const sql = await readFile(new URL('sql/001_initial_schema.sql', root), 'utf8');
  for (const table of [
    'collection_runs',
    'integration_logs',
    'instagram_media',
    'instagram_organic_metrics',
    'instagram_stories',
    'instagram_story_metrics',
    'instagram_media_collaborators',
    'meta_campaigns',
    'meta_adsets',
    'meta_ads',
    'meta_creatives',
    'meta_paid_metrics',
    'content_ad_mapping',
    'metric_definitions',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS meta_raw\\.${table}\\b`));
  }
  assert.match(sql, /raw_payload jsonb/);
  assert.match(sql, /CREATE SCHEMA IF NOT EXISTS meta_raw/);
  assert.match(sql, /UNIQUE \(account_id, instagram_media_id\)/);
});

test('story insights preserves story identity and never writes non-finite metrics', async () => {
  const workflow = await readFile(
    new URL('n8n/workflows/c2-stories-insights.json', root),
    'utf8',
  );
  const document = JSON.parse(workflow);
  const finishNode = document.workflow.nodes.find(
    (node) => node.name === 'Finish Collection Run',
  );
  assert.match(workflow, /consultableStories/);
  assert.match(workflow, /storyId = story\.story_id \?\? sourceStory\.story_id/);
  assert.match(workflow, /Number\.isFinite/);
  assert.match(workflow, /toStatusCode/);
  assert.match(workflow, /reach,replies,navigation/);
  assert.match(workflow, /\"response\":\s*\{\s*\n\s*\"response\":/);
  assert.match(finishNode.parameters.query, /Boolean\(\$\('Assess Story Insights Outcome'/);
  assert.doesNotMatch(finishNode.parameters.query, /CASE WHEN \$\('Assess Story Insights Outcome'/);
  assert.doesNotMatch(workflow, /String\(Number\(value\)\)/);
});
