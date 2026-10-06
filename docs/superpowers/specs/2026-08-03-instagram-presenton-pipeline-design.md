# Instagram to Presenton Pipeline

## Status

Design aprovado para revisao antes do plano de implementacao.

## Objetivo

Criar um pipeline local independente do `ownerinc-brain` que consulte metricas
do Instagram e de publicacoes impulsionadas, gere um direcional editorial e
crie uma apresentacao editavel no Presenton.

## Fluxo

```text
Instagram Graph API
  | GET only
  v
Snapshots locais de metricas
  v
Briefing JSON + Markdown
  v
Presenton local via API
  v
PPTX/PDF salvo localmente
```

O projeto ficara em `projects/instagram-presenton/` e nao dependera do
`projects/ownerinc-brain`.

## Regra de leitura da Meta

A integracao com a Meta sera exclusivamente de leitura:

- o cliente HTTP aceitara somente `GET`;
- `POST`, `PUT`, `PATCH` e `DELETE` serao rejeitados antes do envio;
- nao havera publicacao, edicao, exclusao ou gerenciamento de anuncios;
- o pipeline nao solicitara permissoes de gerenciamento ou publicacao;
- tokens nunca aparecerao em logs, snapshots ou briefings;
- testes verificarao que nenhum caminho escreve na Meta;
- toda documentacao exibira o aviso `SOMENTE PARA LEITURA`.

O `POST` usado para gerar a apresentacao sera enviado somente ao Presenton
local. Ele nao representa uma escrita na Meta.

## Janelas de coleta

Havera dois modos explicitos:

- `weekly`: ultimos 7 dias corridos, comparados aos 7 dias corridos anteriores;
- `monthly`: ultimos 30 dias corridos antes da execucao, usado no inicio de cada
  mes.

Cada snapshot e briefing registrara o modo, inicio e fim dos periodos. A
execucao mensal nao usara mes-calendario: sempre usara uma janela movel de 30
dias corridos.

## Dados coletados

O pipeline usara a conta profissional do Instagram e a conta de anuncios
configuradas localmente:

- publicacoes e identificadores externos;
- alcance, impressoes, visualizacoes e interacoes organicas disponiveis;
- metricas de anuncios usados em impulsionamentos;
- formato, tema e CTA quando presentes nos dados da publicacao;
- avisos de metricas ausentes ou permissoes indisponiveis.

Dados organicos e pagos serao mantidos separados. O total so sera calculado
quando a origem, o periodo e a correlacao forem confiaveis. Anuncios sem
correlacao segura serao marcados como `paid_unmatched`, nunca atribuidos por
estimativa.

## Configuracao

Os segredos e identificadores serao fornecidos por ambiente local:

- `META_ACCESS_TOKEN`;
- `META_GRAPH_API_VERSION`;
- `META_IG_USER_ID`;
- `META_AD_ACCOUNT_ID`;
- `META_PAGE_ID`, quando exigido pelo fluxo da Meta;
- URL, porta e chave da API local do Presenton;
- pasta local de saida.

O projeto nao gravara segredos no Git. A API do Presenton sera usada somente
depois de uma instancia local estar disponivel, preferencialmente via Docker ou
servidor local do projeto open source.

## Briefing

Cada execucao gerara um JSON e um Markdown com:

- identificador da execucao;
- modo e periodos comparados;
- conta e horario da coleta;
- publicacoes e metricas organicas;
- impulsionamentos e metricas pagas;
- correlacoes e itens `paid_unmatched`;
- ranking de conteudos;
- padroes por formato, tema e CTA;
- recomendacoes e hipoteses de teste;
- fontes, avisos e limitacoes.

O briefing devera distinguir fato, interpretacao e recomendacao. Nenhuma
metrica ausente sera convertida silenciosamente em zero.

## Apresentacao

O Presenton recebera `content`, `instructions`, `slides_markdown`, idioma,
template, quantidade de slides e formato de exportacao.

A estrutura inicial tera oito slides:

1. Resumo executivo.
2. Periodo, fontes e qualidade dos dados.
3. Evolucao da conta.
4. Conteudos de melhor desempenho.
5. Organico versus impulsionado.
6. Padroes editoriais.
7. O que repetir ou evitar.
8. Direcional para o proximo ciclo.

As instrucoes proibirao invencao de metricas, mistura de fontes e conclusoes
sem evidencia. O resultado sera salvo localmente em `data/output/`, com pasta
ou nome que inclua o modo e a data da execucao.

## Comandos previstos

```sh
npm run instagram:present -- --window weekly
npm run instagram:present -- --window monthly
```

O modo mensal sera manual no primeiro MVP. Agendamento automatico pode ser
adicionado depois, sem mudar o contrato dos snapshots ou briefings.

## Testes e aceite

Os testes cobrirao:

- cliente Meta somente com `GET`;
- paginacao e respostas simuladas;
- janelas semanal e mensal;
- comparacao com o periodo anterior na janela semanal;
- metricas ausentes, nulas e invalidas;
- separacao organica/paga;
- correlacao segura e `paid_unmatched`;
- ausencia de tokens em logs e arquivos;
- montagem do briefing sem chamadas externas;
- chamada local ao Presenton com payload esperado;
- preservacao de snapshots e saidas anteriores.

O MVP estara aceito quando:

- uma execucao semanal gerar snapshot, briefing e apresentacao local;
- uma execucao mensal gerar a janela movel correta de 30 dias;
- a Meta for acessada somente por `GET`;
- a apresentacao separar organicamente dados organicos e pagos;
- falhas do Presenton nao apagarem os dados coletados;
- os arquivos PPTX/PDF forem salvos localmente;
- nenhum dado for enviado a um servico de apresentacao hospedado.
