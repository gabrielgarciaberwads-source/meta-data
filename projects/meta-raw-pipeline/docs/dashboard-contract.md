# Dashboard Contract

Contrato do dashboard interno de leitura sobre o schema `meta_raw`. A
implementação está em `src/`: API same-origin, consultas parametrizadas e
interface React/Vite. Este documento continua sem autorização para publicar,
ativar workflows ou expor o banco.

## Estado do projeto

A QA real autorizada foi executada manualmente para os seis workflows novos.
C1, Stories Discovery, Collaborative Media e Ads Structure concluíram; Stories
Insights tem métricas indisponíveis representadas explicitamente e Ads Insights
atingiu o limite de segurança de paginação. Por isso o dashboard continua
somente leitura e mantém estados explícitos: agregados validados podem ser
exibidos, enquanto fontes incompletas permanecem `PARTIAL`, sem dados fictícios.

O gate que autorizou a implementação teve como evidência auditável:

- leitura somente dos endpoints aprovados;
- gravação no schema dedicado `meta_raw`;
- `collection_run_id` preservado;
- `raw_payload` preservado;
- separação verificável entre dados Organic e Paid;
- períodos, contas e estados de qualidade conferidos;
- ausência de credenciais, tokens ou URLs sensíveis em dados e logs.

## Limites

- O dashboard será interno e somente leitura.
- Não haverá acesso público.
- Nenhuma credencial nova será criada ou referenciada neste contrato.
- Nenhum workflow será ativado por causa deste documento.
- Organic e Paid permanecem separados na ingestão, na API e na apresentação.
- IDs finais de contas e execuções não são definidos neste documento.
- Ausência de execução real não será representada por dados de exemplo.

## Filtros implementados

Consultas de métricas deverão receber explicitamente:

- `period_start`: data inicial inclusiva (`YYYY-MM-DD`);
- `period_end`: data final inclusiva (`YYYY-MM-DD`);
- `organic_account_id`: conta orgânica validada, quando a consulta for Organic;
- `ad_account_id`: conta de anúncios validada, quando a consulta for Paid.

Regras:

- `period_end` não pode ser anterior a `period_start`;
- uma consulta Organic não deve exigir nem inferir uma conta Paid;
- uma consulta Paid não deve exigir nem inferir uma conta Organic;
- nenhum ID de conta deve ser inventado ou assumido como padrão;
- filtros não disponíveis após a ingestão QA devem retornar estado explícito, não
  uma lista vazia interpretada como ausência de resultados;
- `observed_at` indica quando a métrica foi observada e não substitui o período
  solicitado.

## Endpoints internos implementados

Os endpoints abaixo são de leitura e atendidos pelo mesmo processo do dashboard.
Eles não expõem `raw_payload`, tokens, credenciais ou mensagens de erro brutas.

### `GET /api/dashboard/summary`

Resumo do período solicitado, com blocos independentes `organic` e `paid`.
Cada bloco deverá conter:

- estado de disponibilidade do canal;
- métricas disponíveis;
- estado individual de cada métrica;
- `observed_at` mais recente aplicável;
- cobertura do período;
- avisos de qualidade relacionados ao bloco.

O retorno não deve conter um total combinado Organic + Paid. Qualquer visão
comparativa futura deve manter os dois blocos identificáveis.

### `GET /api/dashboard/timeseries`

Séries temporais separadas por canal, preservando:

- `period_start` e `period_end` da observação;
- nome da métrica;
- valor somente quando disponível;
- estado da métrica;
- dimensões pagas compatíveis, incluindo plataforma e posição quando presentes.

### `GET /api/dashboard/definitions`

Exposição de `meta_raw.metric_definitions`, incluindo:

- `metric_name`;
- `source`;
- `channel`;
- `definition`;
- `aggregation_type`;
- `notes`.

Definições não devem ser duplicadas ou reinterpretadas na interface.

### `GET /api/dashboard/quality`

Resumo de qualidade baseado em `meta_raw.collection_runs` e
`meta_raw.integration_logs`, incluindo:

- estado da execução;
- período solicitado;
- contagens de registros;
- erros e warnings normalizados;
- última observação por canal, quando existente;
- referência ao `collection_run_id`, sem expor segredos.

## Comportamento da interface

O dashboard usa duas camadas de leitura sem alterar o contrato dos dados:

- **Overview** é uma leitura executiva: Organic e Paid aparecem em blocos
  independentes, cada um com um sinal de referência, ponto de atenção, KPIs
  essenciais e uma explicação breve. O sinal de referência é escolhido por uma
  ordem de KPI do próprio canal; não representa um ranking entre métricas de
  naturezas diferentes.
- **Organic** e **Paid** são páginas analíticas: o usuário seleciona uma métrica,
  vê sua evolução em gráfico, consulta o melhor e o menor dia da mesma métrica e
  pode abrir a tabela completa de observações. O gráfico não soma métricas
  `NON_ADDITIVE`, `RECALCULATED` ou `UNKNOWN`.
- Cada card e gráfico mantém o estado de disponibilidade. Ausência de definição,
  valor nulo ou cobertura parcial é apresentado como informação de qualidade,
  nunca convertido silenciosamente em zero.
- A Overview oferece os modos `Week`, `Month` e `Custom`. O período de
  comparação é sempre a faixa inclusiva imediatamente anterior com a mesma
  duração do período selecionado.
- As variações só são exibidas quando o mesmo KPI, canal e unidade possuem valor
  válido nos dois períodos. Período anterior com valor nulo, indisponível ou zero
  não produz uma porcentagem inventada.
- O gráfico de série temporal pode mostrar período atual e anterior, mas mantém
  uma única métrica por vez. Não há overlay de unidades incompatíveis nem total
  combinado entre Organic e Paid.
- Métricas comerciais — contatos qualificados, clientes, receita e conversão —
  permanecem `NOT_CONNECTED` até a existência de uma fonte CRM/ERP. A interface
  pode reservar seus cards e exibir a fórmula, mas não deriva esses resultados da
  Meta.
- A interface visual usa fundo grafite sólido, superfícies escuras, cyan para
  Organic e coral para Paid. O motion é limitado a transições de estado e possui
  fallback para `prefers-reduced-motion`.
- A página **Quality** permanece a referência de rastreabilidade para execuções,
  períodos, estados e definições.

## Estados de disponibilidade

Os estados se aplicam ao dashboard, ao canal e, quando necessário, a cada
métrica individual:

### `NOT_VALIDATED`

Usado enquanto não existir uma primeira execução QA real validada para a fonte,
conta ou período solicitado. Não significa que o valor seja zero.

### `PARTIAL`

Usado quando a execução terminou com cobertura incompleta, warnings, paginação
não concluída ou somente parte das dimensões solicitadas disponível. Os dados
disponíveis podem ser exibidos, desde que o estado permaneça visível.

### `UNAVAILABLE`

Usado quando a fonte, métrica, dimensão ou período não pode fornecer um valor.
O campo de valor deve permanecer ausente ou nulo conforme o contrato final; não
deve ser convertido para zero.

### `NOT_CONNECTED`

Usado quando o indicador depende de uma fonte externa ainda não integrada, como
CRM ou ERP. O estado não equivale a `UNAVAILABLE` da Meta e deve permanecer
visível junto da explicação da fonte necessária.

### Outros estados do schema

Os estados de métrica já definidos no schema devem ser preservados:

- `AVAILABLE`;
- `UNAVAILABLE`;
- `INSUFFICIENT_VIEWERS`;
- `ERROR`.

O valor `0` recebido da API é um valor real. Somente ausência ou falha deve
produzir estado de indisponibilidade.

## Separação Organic/Paid

### Organic

Origem principal:

- `meta_raw.instagram_media`;
- `meta_raw.instagram_organic_metrics`;
- `meta_raw.instagram_stories`;
- `meta_raw.instagram_story_metrics`;
- `meta_raw.instagram_media_collaborators`.

As métricas são observações por mídia ou story e devem respeitar seus períodos,
`observed_at` e `metric_status`.

### Paid

Origem principal:

- `meta_raw.meta_campaigns`;
- `meta_raw.meta_adsets`;
- `meta_raw.meta_ads`;
- `meta_raw.meta_creatives`;
- `meta_raw.meta_paid_metrics`.

As métricas devem preservar as dimensões de anúncio, campanha, adset, creative,
plataforma e posição quando fornecidas.

### Vínculo entre canais

`meta_raw.content_ad_mapping` pode ser usado para navegação ou análise de
relação entre conteúdo e anúncio. Ele não autoriza a soma automática dos canais.
`NOT_APPLICABLE` não é erro.

## Regras de agregação

- Investimento, impressões, cliques, leads e conversões podem ser somados quando
  as dimensões forem compatíveis.
- CTR, CPC, CPM e frequência devem ser recalculados a partir dos componentes,
  nunca somados como se fossem aditivos.
- Alcance não deve ser somado entre canais ou placements sem deduplicação
  comprovada.
- Organic e Paid não devem ser agregados em uma métrica única por padrão.
- Valores com períodos, contas, fontes ou dimensões incompatíveis não devem ser
  combinados silenciosamente.
- Métrica sem registro correspondente em `metric_definitions` deve ser tratada
  como `UNKNOWN` até definição explícita.
- `raw_payload` é evidência de ingestão e não deve ser usado como atalho para
  alterar o contrato de métrica.

## Qualidade e rastreabilidade

Toda resposta implementada deverá permitir rastrear o resultado a:

- período solicitado;
- conta selecionada;
- canal (`ORGANIC` ou `PAID`);
- métrica e definição aplicável;
- `observed_at`;
- `collection_run_id`;
- estado de disponibilidade;
- warnings ou erros relevantes.

Não devem ser expostos tokens, credenciais, payloads contendo segredos ou
configurações operacionais sensíveis.

## Gate de release

O dashboard foi implementado depois da primeira execução QA real, mas sua
publicação/release continua condicionada à aprovação da QA completa. A aprovação
deverá confirmar, no mínimo:

1. existência de `collection_run_id` para Organic e/ou Paid conforme o escopo;
2. registros reais em `meta_raw`, sem dados fictícios;
3. períodos e IDs de conta confirmados;
4. estados de disponibilidade observados e coerentes;
5. regras de agregação verificadas contra os payloads originais;
6. warnings e falhas reproduzíveis em `integration_logs` quando aplicável;
7. nenhuma exposição pública ou alteração de credenciais.

Até esse gate, o serviço pode ser validado localmente ou em ambiente privado,
mas não deve ser considerado uma autorização para publicação pública, ativação de
workflows ou alteração do workflow de alertas existente.
