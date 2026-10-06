# Data Contract

## Identidade da coleta

Toda tabela de ingestao deve preservar:

- `collection_run_id`: execucao que produziu o registro.
- `source`: endpoint ou familia da API.
- `api_version`: versao usada pela chamada.
- `observed_at`: instante em que o dado foi observado.
- `raw_payload`: resposta original da API.

`observed_at` nao substitui `date_start` e `date_stop`. O primeiro representa
quando medimos; os dois ultimos representam o periodo da metrica.

## Entidades

### `instagram_media`

Catalogo de Posts, Carousels e Reels conhecidos. Uma midia nao deve ser criada
duas vezes para a mesma conta.

### `instagram_organic_metrics`

Uma linha por midia, metrica e observacao. Metricas ausentes ficam registradas
com status explicito e nao sao convertidas em zero.

### `instagram_stories`

Catalogo separado porque Stories possuem endpoint, ciclo de vida e retencao
de insights diferentes.

### `instagram_story_metrics`

Snapshots de Stories enquanto estiverem ativos ou ainda consultaveis.
Na API Graph v23, a coleta solicita `reach`, `replies` e `navigation`; este último
representa a soma das ações de navegação (forward, back, exit e próximo Story).
`impressions` não é solicitado para Stories criados após 02/07/2024 porque a
Meta o marca como depreciado para essa mídia. Métricas ausentes permanecem com
valor `NULL` e status explícito.

### `instagram_media_collaborators`

Relacao entre uma midia colaborativa e seus perfis, incluindo `invite_status`.

### `meta_campaigns`, `meta_adsets`, `meta_ads`, `meta_creatives`

Estrutura de anuncios sincronizada antes dos Insights pagos.

### `meta_paid_metrics`

Metricas diarias com as dimensoes de anuncio e placement preservadas.

### `content_ad_mapping`

Ligacoes explicitas entre Creative/Ad e uma midia organica. Dark posts podem
ser `NOT_APPLICABLE`; nao devem ser tratados como erro.

## Regras de metrica

- Investimento, impressoes, cliques, leads e conversoes podem ser somados quando
  as dimensoes sao compativeis.
- CTR, CPC, CPM e frequencia devem ser recalculados a partir dos componentes.
- Alcance nao deve ser somado entre canais ou placements sem deduplicacao.
- Organic e Paid permanecem separados na ingestao.
- Qualquer `0` recebido da API e valor real; ausencia de dado e `null` ou status
  de indisponibilidade.
