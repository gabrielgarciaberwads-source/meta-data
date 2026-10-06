# Ownerinc Meta Data

Repositório separado para os produtos de leitura e coleta de dados da Meta da
Ownerinc. O conteúdo é somente leitura em relação à Meta: não publica, edita ou
exclui conteúdo, nem gerencia campanhas.

## Projetos

- [`projects/metricas_meta`](projects/metricas_meta/README.md): coleta de
  métricas do Instagram/Meta e geração local de briefings PPTX pelo Presenton.
- [`projects/meta-raw-pipeline`](projects/meta-raw-pipeline/README.md): pipeline
  Meta Raw, schema dedicado, workflows n8n, API read-only e dashboard.
- [`projects/instagram-presenton`](projects/instagram-presenton/README.md):
  estrutura legada e documentação histórica, sem implementação ativa.

Planos e especificações históricas ficam em [`docs/superpowers`](docs/superpowers)
para manter a rastreabilidade da evolução dos projetos.

## Escopo monitorado

- Instagram `ownerinc.gramado` — `17841449595671459`.
- Conta de anúncios — `act_277127183253232`.
- Organic e Paid permanecem separados.

## Segurança do repositório

Este repositório público contém somente código, documentação, testes e exemplos
de configuração. Não versionar:

- `.env` ou qualquer credencial;
- snapshots, briefings, logs, PPTX ou outros dados gerados;
- payloads reais da Meta ou dados de produção;
- `node_modules`, builds ou certificados.

Os `.gitignore` dos dois projetos mantêm essas exclusões. A ausência de dados
gerados neste repositório é intencional.

## Verificação local

```powershell
npm test --prefix projects/metricas_meta
npm run verify --prefix projects/meta-raw-pipeline
```

Para gerar apenas o dashboard:

```powershell
npm run build --prefix projects/meta-raw-pipeline
```

## Deploy

O workflow do dashboard está em
`.github/workflows/meta-raw-dashboard.yml`. Pull requests executam somente a
verificação. Publicação da imagem e deploy exigem acionamento manual explícito
com os inputs correspondentes; o primeiro push deste repositório não reinicia
serviços nem publica nada automaticamente.
