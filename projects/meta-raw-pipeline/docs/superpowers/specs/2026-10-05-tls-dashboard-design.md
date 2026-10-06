# TLS, Dashboard e QA — Design

## Objetivo

Habilitar transporte TLS entre n8n, o PostgreSQL dedicado e a API interna do
dashboard; executar QA manual controlado dos workflows; e entregar um
dashboard Ownerinc somente leitura, sem exportar payloads, métricas ou
credenciais para o GitHub, o navegador ou o chat.

## Sequência aprovada

1. Configurar e validar TLS no VPS.
2. Executar QA manual real, um workflow por vez, mantendo todos os workflows
   manuais, inativos e não publicados.
3. Implementar o dashboard após a primeira execução QA validada.
4. Validar API, interface, responsividade e deploy sem alterar o estado dos
   workflows.

## Arquitetura

```text
Meta Graph API
      ↓ read-only
n8n manual drafts
      ↓ PostgreSQL over TLS/private Docker network
PostgreSQL meta_raw
      ↓ PostgreSQL over TLS/private Docker network
Read-only dashboard API
      ↓ same-origin internal app
React/Vite dashboard
```

Será usado um único serviço Node que serve os assets React/Vite e a API
same-origin. A API terá uma role PostgreSQL dedicada somente leitura e ficará
conectada apenas à rede privada existente. O navegador nunca terá acesso direto
ao PostgreSQL.

O PostgreSQL continuará sem porta publicada. A CA interna e o certificado do
servidor serão gerados somente no VPS, fora do Git. A CA pública para validação
será montada em modo leitura no n8n e na API do dashboard. O PostgreSQL usará
`ssl=on` e regras `hostssl`.

## Dados e API

A API oferecerá somente estes endpoints same-origin:

- `GET /api/health`;
- `GET /api/dashboard/summary`;
- `GET /api/dashboard/timeseries`;
- `GET /api/dashboard/definitions`;
- `GET /api/dashboard/quality`.

Consultas de métricas exigirão datas e o ID da conta aplicável. Organic e Paid
serão consultados e retornados em blocos separados, sem total combinado
implícito. A API poderá retornar `collection_run_id`, período, `observed_at`,
contagens, estados e avisos normalizados, mas nunca selecionará nem serializará
`raw_payload`, tokens, senhas, credenciais, strings de conexão ou URLs sensíveis.

Estados de disponibilidade serão preservados e exibidos explicitamente:
`NOT_VALIDATED`, `AVAILABLE`, `PARTIAL`, `UNAVAILABLE`,
`INSUFFICIENT_VIEWERS` e `ERROR`. O valor numérico `0` continuará sendo um
valor real e não será convertido em indisponibilidade.

## QA e rastreabilidade

Cada workflow necessário será executado manualmente, um por vez, com os dados
fluindo somente de Meta para o PostgreSQL dedicado. A verificação conferirá:

- handshake TLS e conexão pela credencial PostgreSQL dedicada;
- `collection_run_id`, status, períodos e IDs de conta;
- contagens e registros nas tabelas `meta_raw`;
- logs em `integration_logs`;
- idempotência em uma repetição segura;
- ausência de segredo em payloads e logs;
- ausência de saídas para GitHub, terceiros ou outros destinos.

Relatórios de QA conterão somente status, códigos de erro sanitizados,
identificadores de execução autorizados e contagens agregadas. Payloads reais,
tokens, certificados e strings de conexão não serão gravados em arquivos,
artefatos de build ou respostas de chat.

## Interface

O dashboard terá quatro vistas:

- **Overview:** resumo do período com blocos independentes Organic e Paid;
- **Organic:** mídia, stories, colaboradores e métricas orgânicas;
- **Paid:** campanhas, adsets, anúncios, creatives e dimensões pagas;
- **Quality:** runs, cobertura, warnings, logs normalizados e estados de fonte.

A direção visual é editorial Ownerinc: papel quente/off-white, azul-noite,
vermelho-terra e ciano pontual, tipografia local aprovada quando disponível,
linhas finas, espaço negativo, sem gradientes e sem cards aninhados sem função.
Loading, erro de API, `NOT_VALIDATED`, `PARTIAL` e `UNAVAILABLE` serão estados
visíveis; não haverá fixtures de produção.

## Deploy e limites operacionais

O dashboard terá Dockerfile, Compose próprio e workflow GitHub Actions para
deploy por SSH. Secrets ficarão somente na configuração protegida do VPS ou
nos secrets do GitHub Actions; nenhum valor será versionado. O workflow de
deploy construirá a imagem, atualizará somente o serviço do dashboard e fará
health check. Não executará migrações destrutivas, não alterará workflows do
n8n e não reiniciará PostgreSQL ou n8n.

Os seis workflows novos permanecerão manuais, inativos e sem versão publicada.
O workflow preexistente de alertas continuará fora do escopo e não será alterado
silenciosamente. Publicação ou ativação exigirá autorização separada.

## Validação

Serão executados testes de contrato e API, build do dashboard, validação dos
exports n8n, `git diff --check`, smoke test responsivo e `npm run verify` na
raiz. O gate final verificará que não existe porta pública `5432`, que o
dashboard não expõe segredos e que todos os workflows novos continuam
inativos/não publicados.
