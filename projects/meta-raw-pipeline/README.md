# Meta Raw Pipeline

Pipeline isolado para coletar dados de `ownerinc.gramado` e da conta de anuncios
`act_277127183253232` usando n8n e PostgreSQL dedicado.

Este projeto nao compartilha codigo, banco, credenciais ou workflows com
`projects/metricas_meta` ou qualquer outro produto.

## Escopo inicial

- Posts, carousels e Reels do Instagram profissional `17841449595671459`.
- Insights organicos disponiveis por midia.
- Stories e seus snapshots quando a API liberar as metricas.
- Collaborative Media e colaboradores retornados pela API.
- Campaigns, adsets, ads e creatives da conta `act_277127183253232`.
- Ads Insights diarios por plataforma e posicao.
- Payload original em PostgreSQL `jsonb`.
- Execucoes idempotentes e logs de qualidade.

`owntime.gramado` pode aparecer como colaborador relacionado, mas nao e uma
conta organica monitorada nesta fase.

## Isolamento

- PostgreSQL: database ou schema dedicado para este projeto.
- n8n: credenciais novas, sem reutilizar credenciais de Leads.
- Workflows: prefixo `OWNERINC - META RAW -` e status inativo ate validacao.
- Meta: chamadas somente de leitura.

## Artefatos

- `sql/001_initial_schema.sql`: schema inicial do banco.
- `docs/data-contract.md`: contrato das tabelas e regras de agregacao.
- `docs/dashboard-contract.md`: contrato implementado do dashboard, estados de
  disponibilidade e gate de release apos a primeira execucao QA.
- `docs/security-review.md`: revisão de segurança condicional e pendências de
  transporte interno e workflow de alertas existente.
- `docs/qa-report.md`: resultado da auditoria estrutural dos seis workflows e
  seus gates de execução.
- `src/`: API same-origin e interface read-only do dashboard Ownerinc.
- `Dockerfile` e `deploy/dashboard-compose.yml`: imagem e runtime privado do
  dashboard, sem porta PostgreSQL publicada.
- `.github/workflows/meta-raw-dashboard.yml`: verificação, publicação no GHCR e
  deploy isolado por SSH do serviço `meta-raw-dashboard`.
- `n8n/workflows/`: exports dos workflows deste projeto.
- `tests/contract.test.mjs`: verificacoes pequenas do contrato.

O dashboard abre em uma visão executiva que mantém Organic e Paid separados,
mostra o melhor sinal validado e o ponto de atenção de cada canal e explica os
KPIs sem transformar ausência em zero. As páginas Organic e Paid acrescentam
gráficos de série temporal por métrica, melhores/menores dias da mesma métrica,
definições do dicionário e uma tabela de evidências. A Overview permite Week,
Month e Custom, comparando o período selecionado com a faixa inclusiva anterior
de mesma duração; o visual usa superfícies grafite sólidas e estados explícitos
para dados parciais, indisponíveis e fontes comerciais não conectadas.

## Credenciais necessarias no n8n

Criar credenciais novas no n8n, sem salvar segredos neste repositorio:

- `OWNERINC - META RAW - META GRAPH API - RUNTIME V1`
- `OWNERINC - META RAW - POSTGRES - RUNTIME V1`

Os workflows devem permanecer inativos ate essas credenciais apontarem para o
App Meta validado e para o PostgreSQL exclusivo.

## Estado operacional do n8n

A instancia atual nao possui projetos de equipe habilitados. Como decisao de
isolamento, os workflows deste produto usam o espaco pessoal somente com o
prefixo `OWNERINC - META RAW -` e nunca reutilizam workflows ou credenciais de
outros produtos. Essa e uma separacao por namespace, nao uma alegacao de
isolamento de projeto no n8n.

Todos os workflows novos devem permanecer manuais, inativos e sem versao
publicada ate que QA, seguranca e autorizacao explicita de release estejam
concluidos. O workflow de alertas existente e avaliado separadamente e nao deve
ser alterado silenciosamente.

## Dashboard read-only

O dashboard é servido por um processo Node único, com React/Vite compilado em
`dist/` e API same-origin em `/api/*`. O navegador nunca recebe credenciais nem
se conecta diretamente ao PostgreSQL; o processo usa a role somente leitura
`meta_raw_dashboard` e a CA montada em modo leitura.

```sh
npm ci
npm run verify
npm start
```

Em VPS, o arquivo populado de variáveis deve existir somente em
`/opt/ownerinc/secrets/meta-raw-pipeline/dashboard.env`. O Compose de produção
usa as redes Docker privadas `meta_raw_internal` e `ownerinc_proxy`, não publica
`5432` nem uma porta direta do dashboard e executa somente o serviço
`meta-raw-dashboard`. A Action de deploy requer secrets de transporte SSH e um
token de leitura do GHCR; ela não recebe credenciais do Meta, n8n ou PostgreSQL.
