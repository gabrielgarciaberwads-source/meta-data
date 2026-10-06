import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBriefing } from '../src/briefing.mjs';

function snapshot(overrides = {}) {
  return {
    runId: 'run-6',
    source: 'meta',
    window: {
      kind: 'weekly',
      current: { start: '2026-07-27', end: '2026-08-02' },
      previous: { start: '2026-07-20', end: '2026-07-26' },
    },
    posts: [{
      externalId: 'media-1',
      mediaType: 'IMAGE',
      caption: { hasText: true, length: 12 },
      organic: { impressions: 10, likes: 2, reach: null },
      paid: { impressions: 5, likes: 1 },
      total: { impressions: 15, likes: 3, reach: null },
    }],
    correlations: { paid_unmatched: [{ type: 'paid_unmatched', ad: { ad_id: 'ad-2' } }] },
    warnings: ['paid_unmatched: no_explicit_media_identifier'],
    ...overrides,
  };
}

test('emits the exact eight slide headings and period language', () => {
  const { markdown } = buildBriefing(snapshot());
  const expectedHeadings = [
    'Resumo executivo', 'Periodo, fontes e qualidade dos dados', 'Evolucao da conta',
    'Conteudos de melhor desempenho', 'Organico versus impulsionado', 'Padroes editoriais',
    'O que repetir ou evitar', 'Direcional para o proximo ciclo',
  ];
  const headings = markdown.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3));
  assert.deepEqual(headings, expectedHeadings);
  assert.match(markdown, /ultimos 7 dias/);
  assert.match(markdown, /7 dias anteriores/);
  assert.match(markdown, /paid_unmatched/);
});

test('uses rolling thirty-day language for monthly briefings', () => {
  const { json, markdown } = buildBriefing(snapshot({
    window: {
      kind: 'monthly',
      current: { start: '2026-07-04', end: '2026-08-02' },
      previous: { start: '2026-06-04', end: '2026-07-04' },
    },
  }));
  assert.equal(json.mode, 'monthly');
  assert.match(markdown, /ultimos 30 dias corridos/);
  assert.match(markdown, /30 dias anteriores/);
  assert.doesNotMatch(markdown, /mes anterior/);
});

test('emits the approved eleven monthly headings and strategic metric chains', () => {
  const { json, markdown } = buildBriefing(snapshot({
    window: {
      kind: 'monthly',
      current: { start: '2026-07-04', end: '2026-08-02' },
      previous: { start: '2026-06-04', end: '2026-07-04' },
    },
    account: { reach: 100, follows: 8, unfollows: 3, follower_growth: 5, total_interactions: null },
    periods: { previous: { account: { reach: 80, follows: 5, unfollows: 2, follower_growth: 3, total_interactions: 10 } } },
  }));
  assert.deepEqual(
    markdown.split('\n').filter((line) => line.startsWith('## ')).map((line) => line.slice(3)),
    ['Capa', 'Resumo executivo', 'Objetivo da análise', 'Visão geral dos resultados', 'Análise de visibilidade', 'Análise de engajamento', 'Análise por formato', 'Top conteúdos do período', 'Diagnóstico', 'Recomendações práticas', 'Plano de ação'],
  );
  assert.equal(json.facts.accountComparison.delta.reach, 20);
  assert.ok(json.strategicChains.some((line) => line.includes('conta/reach') && line.includes('proxima acao')));
  assert.match(json.presentonInstructions, /somente PPTX/);
});

test('separates channels, ranks only numbers, and preserves missing metrics', () => {
  const { json, markdown } = buildBriefing(snapshot());
  assert.equal(json.rankings.organic.impressions[0].value, 10);
  assert.equal(json.rankings.paid.impressions[0].value, 5);
  assert.deepEqual(json.facts.organicTotals, { impressions: 10, likes: 2 });
  assert.deepEqual(json.facts.paidTotals, { impressions: 5, likes: 1 });
  assert.deepEqual(json.facts.missingMetrics, ['media-1:reach']);
  assert.ok(json.warnings.some((warning) => warning.includes('paid_unmatched')));
  assert.match(json.recommendations[0], /media-1.*impressions=10/);
  assert.match(json.recommendations[0], /IMAGE/);
  assert.match(json.recommendations[1], /paid_unmatched/);
  assert.match(json.presentonInstructions, /nao faca conclusoes sem suporte/);
  assert.match(markdown, /nao faca conclusoes sem suporte/);
});

test('is deterministic and contains no secret material', () => {
  const input = snapshot({
    accessToken: 'access-token-should-not-appear',
    authorization: 'Bearer header-secret-should-not-appear',
    api_key: 'api-key-should-not-appear',
    nested: { client_secret: 'client-secret-should-not-appear' },
    warnings: ['secret=inline-secret-should-not-appear', 'Bearer inline-bearer-should-not-appear'],
  });
  const first = buildBriefing(input);
  const second = buildBriefing(input);
  assert.deepEqual(first, second);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /access-token-should-not-appear|header-secret-should-not-appear|api-key-should-not-appear|client-secret-should-not-appear|inline-secret-should-not-appear|inline-bearer-should-not-appear/);
  assert.doesNotMatch(serialized, /Bearer\s+[^[]|accessToken|authorization|api_key|client_secret/i);
});
