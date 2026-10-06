const SLIDE_HEADINGS = [
  'Resumo executivo',
  'Periodo, fontes e qualidade dos dados',
  'Evolucao da conta',
  'Conteudos de melhor desempenho',
  'Organico versus impulsionado',
  'Padroes editoriais',
  'O que repetir ou evitar',
  'Direcional para o proximo ciclo',
];

const METRIC_ORDER = ['impressions', 'reach', 'engagement', 'engagements', 'likes', 'comments', 'shares', 'saves', 'clicks', 'spend'];
const MONTHLY_SLIDE_HEADINGS = [
  'Capa',
  'Resumo executivo',
  'Objetivo da análise',
  'Visão geral dos resultados',
  'Análise de visibilidade',
  'Análise de engajamento',
  'Análise por formato',
  'Top conteúdos do período',
  'Diagnóstico',
  'Recomendações práticas',
  'Plano de ação',
];
const SECRET_PATTERN = /(bearer\s+[^\s,;]+|(?:access[_-]?token|auth[_-]?token|token|authorization|api[_-]?key|secret|values)\s*[:=]\s*[^\s,;"']+)/gi;

function finiteEntries(metrics) {
  return Object.entries(metrics && typeof metrics === 'object' ? metrics : {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value));
}

function metricValue(post, channel, metric) {
  const value = post?.[channel]?.[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function rankPosts(posts, channel, metric) {
  return posts
    .map((post) => ({ post, value: metricValue(post, channel, metric) }))
    .filter(({ value }) => value !== null)
    .sort((left, right) => right.value - left.value || String(left.post.externalId ?? '').localeCompare(String(right.post.externalId ?? '')))
    .map(({ post, value }, index) => ({ rank: index + 1, externalId: post.externalId ?? null, metric, value, channel }));
}

function rankings(posts) {
  const result = { organic: {}, paid: {} };
  for (const channel of ['organic', 'paid']) {
    for (const metric of METRIC_ORDER) {
      const ranked = rankPosts(posts, channel, metric);
      if (ranked.length) result[channel][metric] = ranked;
    }
  }
  return result;
}

function periodText(window) {
  if (window?.kind === 'monthly') {
    return `Periodo mensal: ultimos 30 dias corridos (${window.current?.start ?? 'indisponivel'} a ${window.current?.end ?? 'indisponivel'}) comparados com os 30 dias anteriores (${window.previous?.start ?? 'indisponivel'} a ${window.previous?.end ?? 'indisponivel'}).`;
  }
  return `Periodo semanal: ultimos 7 dias (${window?.current?.start ?? 'indisponivel'} a ${window?.current?.end ?? 'indisponivel'}) comparados com os 7 dias anteriores (${window?.previous?.start ?? 'indisponivel'} a ${window?.previous?.end ?? 'indisponivel'}).`;
}

function availableTotals(posts, channel) {
  const totals = {};
  for (const post of posts) {
    for (const [metric, value] of finiteEntries(post?.[channel])) totals[metric] = (totals[metric] ?? 0) + value;
  }
  return totals;
}

function patterns(posts) {
  const mediaTypes = {};
  let captions = 0;
  for (const post of posts) {
    if (post.mediaType) mediaTypes[post.mediaType] = (mediaTypes[post.mediaType] ?? 0) + 1;
    if (post.caption?.hasText) captions += 1;
  }
  return { postCount: posts.length, captionsWithText: captions, mediaTypes };
}

function recommendations(posts, rankingData, warnings) {
  const lead = ['impressions', 'engagement', 'reach', 'likes']
    .flatMap((metric) => rankingData.organic[metric] ?? [])
    .at(0);
  const recommendationsList = [];
  if (lead) {
    const post = posts.find((entry) => entry.externalId === lead.externalId);
    const format = post?.mediaType ? ` no formato ${post.mediaType}` : '';
    recommendationsList.push(`Repetir ou adaptar o conteudo ${lead.externalId ?? 'sem identificador'}${format}: ${lead.metric}=${lead.value}; testar uma variacao controlada no proximo ciclo.`);
  } else {
    recommendationsList.push('Evidencia insuficiente para recomendar um conteudo ou formato especifico: nenhuma metrica organica numerica esta disponivel para ranking.');
  }
  if (warnings.some((warning) => String(warning).includes('paid_unmatched'))) {
    recommendationsList.push('Diante de paid_unmatched, nao atribuir desempenho pago a um conteudo sem identificador explicito; testar a coleta de identificadores antes de comparar impulsionamento.');
  } else if (Object.keys(rankingData.paid).length) {
    const paid = rankingData.paid.impressions?.[0] ?? rankingData.paid.engagement?.[0];
    recommendationsList.push(`Usar o conteudo pago ${paid.externalId ?? 'sem identificador'} apenas como hipotese de teste: ${paid.metric}=${paid.value}; nao inferir causalidade.`);
  } else {
    recommendationsList.push('Evidencia insuficiente para recomendar investimento pago: nenhuma metrica paga numerica esta disponivel.');
  }
  return recommendationsList;
}

function deriveRunId(snapshot) {
  if (snapshot?.runId != null) return String(snapshot.runId);
  if (snapshot?.id != null) return String(snapshot.id);
  return String(snapshot?.collectedAt ?? 'unknown-run').replace(/[^a-zA-Z0-9._-]/g, '-');
}

function clean(value) {
  if (typeof value === 'string') return value.replace(SECRET_PATTERN, '[REDACTED]');
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/^(?:token|access[_-]?token|auth[_-]?token|authorization|secret|api[_-]?key|values)$/i.test(key))
      .map(([key, entry]) => [key, clean(entry)]));
  }
  return value;
}

function monthlyComparison(current, previous) {
  const delta = {};
  for (const metric of new Set([...Object.keys(current ?? {}), ...Object.keys(previous ?? {})])) {
    delta[metric] = Number.isFinite(current?.[metric]) && Number.isFinite(previous?.[metric])
      ? current[metric] - previous[metric]
      : null;
  }
  return { current: current ?? {}, previous: previous ?? {}, delta };
}

function strategicChains(snapshot, account, organicTotals, paidTotals, accountComparison) {
  const metrics = [
    ...Object.entries(account ?? {}).map(([metric, value]) => ({ channel: 'conta', metric, value, previous: accountComparison.previous[metric] })),
    ...Object.entries(organicTotals).map(([metric, value]) => ({ channel: 'organico', metric, value, previous: snapshot.comparison?.previous?.organic?.[metric] })),
    ...Object.entries(paidTotals).map(([metric, value]) => ({ channel: 'pago', metric, value, previous: snapshot.comparison?.previous?.paid?.[metric] })),
  ];
  return metrics.map(({ channel, metric, value, previous }) => {
    const happened = Number.isFinite(value) ? `${value}` : 'indisponivel (null)';
    const compared = Number.isFinite(value) && Number.isFinite(previous)
      ? `${previous}, variacao de ${value - previous}`
      : 'periodo anterior indisponivel para comparacao';
    const why = ['reach', 'impressions', 'views'].includes(metric)
      ? 'mede visibilidade e capacidade de distribuicao'
      : ['likes', 'comments', 'shares', 'saves', 'replies', 'total_interactions', 'accounts_engaged'].includes(metric)
        ? 'indica resposta e profundidade do engajamento'
        : 'ajuda a avaliar conversao, crescimento ou eficiencia do canal';
    return `- ${channel}/${metric}: o que aconteceu=${happened}; comparado com=${compared}; por que importa=${why}; hipotese=as variacoes refletem a combinacao de formato, distribuicao, tema e/ou investimento, sem prova de causalidade; proxima acao=replicar o formato em teste controlado e medir o mesmo indicador no proximo ciclo.`;
  });
}

function buildMonthlyBriefing(snapshot = {}) {
  const posts = Array.isArray(snapshot.posts) ? snapshot.posts : [];
  const warnings = [...(Array.isArray(snapshot.warnings) ? snapshot.warnings : [])];
  const unmatched = snapshot.correlations?.paid_unmatched ?? [];
  if (unmatched.length && !warnings.some((warning) => String(warning).includes('paid_unmatched'))) {
    warnings.push(`paid_unmatched: ${unmatched.length} paid record(s) without a safe media match`);
  }
  const organicTotals = availableTotals(posts, 'organic');
  const paidTotals = availableTotals(posts, 'paid');
  const account = snapshot.periods?.current?.account ?? snapshot.account ?? {};
  const accountComparison = monthlyComparison(account, snapshot.periods?.previous?.account);
  const chains = strategicChains(snapshot, account, organicTotals, paidTotals, accountComparison);
  const rankingData = rankings(posts);
  const facts = {
    period: periodText(snapshot.window),
    postCount: posts.length,
    accountMetrics: account,
    organicTotals,
    paidTotals,
    accountComparison,
    comparison: snapshot.comparison ?? null,
  };
  const safeWarnings = clean(warnings);
  const json = clean({
    runId: deriveRunId(snapshot),
    mode: 'monthly',
    source: snapshot.source ?? 'unknown',
    periods: snapshot.window ?? null,
    posts,
    rankings: rankingData,
    patterns: patterns(posts),
    facts,
    strategicChains: chains,
    recommendations: recommendations(posts, rankingData, warnings),
    warnings: safeWarnings,
    limitations: ['Valores nulos significam metricas indisponiveis ou invalidas, nunca zero.', 'Atribuicao paga sem identificador explicito permanece paid_unmatched.', 'Hipoteses nao demonstram causalidade.'],
    presentonInstructions: 'Use somente fatos fornecidos. Preserve organico e pago separados, trate null como indisponivel, mostre warnings e paid_unmatched, nao invente metricas e escreva cada cadeia estrategica como fato, comparacao, relevancia, hipotese e proxima acao. Gere somente PPTX.',
  });
  const slide = (heading, lines) => [`## ${heading}`, ...lines].join('\n');
  const topOrganic = rankingData.organic.impressions?.slice(0, 5) ?? [];
  const markdown = [
    `# Briefing mensal estrategico: ${json.runId}`,
    '',
    slide(MONTHLY_SLIDE_HEADINGS[0], [`${periodText(snapshot.window)}`, 'Relatorio mensal de leitura estrategica, sem escrita na Meta.']),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[1], [`Posts analisados: ${posts.length}. Conta: ${JSON.stringify(account)}.`, `Organico: ${JSON.stringify(organicTotals)}. Pago: ${JSON.stringify(paidTotals)}.`, 'Use os resultados como hipoteses testaveis, nao como causalidade.']),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[2], ['Comparar visibilidade, engajamento, formatos e conteudos do periodo atual com o periodo anterior equivalente.', 'Separar o que e organico do que e pago e sinalizar limites de cobertura da API.']),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[3], [`Conta atual versus anterior: ${JSON.stringify(accountComparison)}.`, `Conteudos organicos versus anteriores: ${JSON.stringify(snapshot.comparison?.organic ?? {})}.`, `Conteudos pagos versus anteriores: ${JSON.stringify(snapshot.comparison?.paid ?? {})}.`]),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[4], [`Alcance, impressoes e visualizacoes: ${JSON.stringify({ reach: account.reach, impressions: account.impressions, views: account.views })}.`, `Perfil e cliques: ${JSON.stringify({ profile_views: account.profile_views, website_clicks: account.website_clicks, profile_links_taps: account.profile_links_taps })}.`]),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[5], [`Interacoes da conta: ${JSON.stringify({ accounts_engaged: account.accounts_engaged, total_interactions: account.total_interactions, likes: account.likes, comments: account.comments, shares: account.shares, saves: account.saves })}.`, `Crescimento: ${JSON.stringify({ follows: account.follows, unfollows: account.unfollows, follower_growth: account.follower_growth })}.`]),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[6], [`Distribuicao por tipo: ${JSON.stringify(patterns(posts).mediaTypes)}.`, 'Comparar formatos apenas quando houver metricas numericas; nulos permanecem indisponiveis.']),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[7], [`Top conteudos organicos por impressoes: ${JSON.stringify(topOrganic)}.`, `Top conteudos pagos: ${JSON.stringify(rankingData.paid.impressions?.slice(0, 5) ?? [])}.`]),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[8], ['Cadeias estrategicas por métrica:', ...chains, ...(safeWarnings.length ? ['Avisos de qualidade:', ...safeWarnings.map((warning) => `- ${warning}`)] : [])]),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[9], [...(json.recommendations ?? []).map((recommendation) => `- ${recommendation}`), '- Priorizar indicadores com cobertura confirmada e abrir investigação separada para cada warning de suporte ou permissão.']),
    '',
    slide(MONTHLY_SLIDE_HEADINGS[10], ['1. Selecionar um formato e uma hipótese por objetivo.', '2. Publicar uma variação controlada mantendo janela e métrica comparáveis.', '3. Revisar organico e pago separadamente após o próximo ciclo.', '4. Corrigir identificadores e investigar paid_unmatched antes de atribuir investimento.', 'Instruções Presenton:', json.presentonInstructions]),
  ].join('\n');
  return { json, markdown };
}

export function buildBriefing(snapshot = {}) {
  if (snapshot.window?.kind === 'monthly') return buildMonthlyBriefing(snapshot);
  const posts = Array.isArray(snapshot.posts) ? snapshot.posts : [];
  const mode = snapshot.window?.kind ?? snapshot.mode ?? 'unknown';
  const warnings = [...(Array.isArray(snapshot.warnings) ? snapshot.warnings : [])];
  const unmatched = snapshot.correlations?.paid_unmatched ?? [];
  if (unmatched.length && !warnings.some((warning) => String(warning).includes('paid_unmatched'))) {
    warnings.push(`paid_unmatched: ${unmatched.length} paid record(s) without a safe media match`);
  }
  const safeWarnings = clean(warnings);
  const missingMetrics = posts.flatMap((post) => Object.entries(post.total ?? {})
    .filter(([, value]) => value === null)
    .map(([metric]) => `${post.externalId ?? 'unknown'}:${metric}`));
  const facts = {
    period: periodText(snapshot.window),
    postCount: posts.length,
    organicTotals: availableTotals(posts, 'organic'),
    paidTotals: availableTotals(posts, 'paid'),
    missingMetrics,
    comparison: snapshot.comparison ?? null,
  };
  const rankingData = rankings(posts);
  const json = clean({
    runId: deriveRunId(snapshot),
    mode,
    periods: snapshot.window ?? null,
    source: snapshot.source ?? 'unknown',
    posts,
    rankings: rankingData,
    patterns: patterns(posts),
    facts,
    comparison: snapshot.comparison ?? null,
    interpretations: [
      posts.length < 3 ? 'A amostra e pequena; trate qualquer padrao como hipotese, nao como causalidade.' : 'Os padroes observados descrevem associacoes nos dados disponiveis, nao causalidade.',
      'Metricas organicas e pagas permanecem separadas; totais so sao usados quando o pareamento e seguro.',
    ],
    recommendations: recommendations(posts, rankingData, warnings),
    warnings: safeWarnings,
    limitations: [
      'Valores nulos significam metricas indisponiveis ou invalidas e nao equivalem a zero.',
      'Atribuicao paga sem identificador explicito permanece paid_unmatched.',
      'Nao ha dados suficientes neste briefing para afirmar causalidade.',
    ],
    presentonInstructions: 'Use somente os fatos e metricas fornecidos. Nao invente valores, nao misture atribuicao organica e paga, explicite os periodos, nao faca conclusoes sem suporte e apresente conclusoes como hipoteses testaveis quando a amostra for pequena.',
  });

  const markdown = [
    `# Briefing direcional: ${json.runId}`,
    '',
    `## ${SLIDE_HEADINGS[0]}`,
    periodText(snapshot.window),
    `Posts analisados: ${facts.postCount}. Recomendacoes sao hipoteses para teste, nao certezas causais.`,
    '',
    `## ${SLIDE_HEADINGS[1]}`,
    `Fonte: ${json.source}. ${periodText(snapshot.window)}`,
    `Qualidade: ${warnings.length ? `${warnings.length} aviso(s).` : 'sem avisos registrados.'}`,
    '',
    `## ${SLIDE_HEADINGS[2]}`,
    `Metricas organicas disponiveis: ${JSON.stringify(facts.organicTotals)}.`,
    `Metricas pagas disponiveis: ${JSON.stringify(facts.paidTotals)}.`,
    `Deltas do periodo anterior: ${JSON.stringify(facts.comparison?.delta ?? null)}.`,
    '',
    `## ${SLIDE_HEADINGS[3]}`,
    'Rankings consideram somente valores numericos disponiveis; nulos nao sao convertidos em zero.',
    `Organico: ${JSON.stringify(json.rankings.organic)}.`,
    `Impulsionado: ${JSON.stringify(json.rankings.paid)}.`,
    '',
    `## ${SLIDE_HEADINGS[4]}`,
    'Organico e impulsionado sao apresentados separadamente. Registros sem pareamento seguro nao sao somados.',
    '',
    `## ${SLIDE_HEADINGS[5]}`,
    `Posts: ${json.patterns.postCount}; com legenda: ${json.patterns.captionsWithText}; tipos: ${JSON.stringify(json.patterns.mediaTypes)}.`,
    '',
    `## ${SLIDE_HEADINGS[6]}`,
    'Repetir formatos associados a metricas disponiveis, evitando transformar associacao em causalidade.',
    'Testar variacoes controladas e nao preencher metricas ausentes.',
    '',
    `## ${SLIDE_HEADINGS[7]}`,
    'Proximo ciclo: testar as recomendacoes com um novo periodo comparavel e registrar o resultado.',
    '',
    '### Instrucoes para o Presenton',
    json.presentonInstructions,
    '',
    'Avisos:',
    ...(safeWarnings.length ? safeWarnings.map((warning) => `- ${warning}`) : ['- Nenhum']),
  ].join('\n');

  return { json, markdown };
}
