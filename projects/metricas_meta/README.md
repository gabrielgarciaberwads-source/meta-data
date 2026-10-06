# Metricas Meta para Presenton

> **SOMENTE PARA LEITURA**

Workspace para ler dados do Instagram/Meta e preparar briefings para o
Presenton. A integracao com a Meta usa somente GET e nunca publica, edita ou
exclui conteudo, nem gerencia anuncios ou campanhas.

## Setup local

1. Copie `.env.example` para `.env`.
2. Preencha as credenciais e os caminhos locais necessarios.
3. Instale o Node.js em uma versao com suporte a ESM e ao test runner nativo.
4. Execute os comandos a partir da raiz do workspace ou deste diretorio.

Nao ha dependencias de runtime neste workspace. O `PRESENTON_API_KEY` deve ser
preenchido com uma chave criada no Admin do Presenton quando a autenticacao
estiver habilitada.

A saída deste pipeline é exclusivamente PPTX editável. Configure
`PRESENTON_EXPORT_AS=pptx`; outros formatos são rejeitados. Os arquivos são
salvos localmente em `data/output/`.
`PRESENTON_TIMEOUT_MS` controla o tempo máximo da geração local; o padrão é
`180000` milissegundos (3 minutos).

## Presenton self-hosting

Execute o Presenton conforme a documentacao da instalacao self-hosted e use a
URL da instancia em `PRESENTON_BASE_URL`. Se a autenticacao estiver
desabilitada, deixe `PRESENTON_API_KEY` vazio; caso esteja habilitada, use a
chave fornecida pelo Admin do Presenton. O aplicativo Presenton instalado nao
faz parte deste workspace e nao e alterado por este projeto.

## Comandos

Dentro de `projects/metricas_meta`:

```sh
npm run instagram:present -- --window weekly
npm run instagram:present -- --window monthly
npm test
```

O mensal compara os ultimos 30 dias corridos com os 30 dias corridos
anteriores. Alem dos insights por media e dos insights pagos, tenta coletar
insights de conta do Instagram para alcance, impressoes, visualizacoes,
crescimento de seguidores, contas engajadas, interacoes, visitas ao perfil,
cliques no site e outros indicadores suportados pela conta e pela versao da
Graph API configurada. Cada metrica e solicitada isoladamente: metricas sem
suporte ou sem permissao ficam `null` e geram warning, nunca zero inventado.

```sh
npm run instagram:present -- --window monthly
```

O semanal permanece com a estrutura anterior e nao faz a coleta adicional de
insights de conta. O mensal gera exatamente 11 slides: Capa; Resumo executivo;
Objetivo da análise; Visão geral dos resultados; Análise de visibilidade;
Análise de engajamento; Análise por formato; Top conteúdos do período;
Diagnóstico; Recomendações práticas; Plano de ação.

Em ambos os fluxos, organico e pago permanecem separados e atribuicoes sem
pareamento seguro continuam registradas como `paid_unmatched`. O Presenton
recebe uma string de conteudo e um array de markdown de slides e a saida aceita
e somente PPTX.

## Configuracao de leitura

`META_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`, `META_IG_USER_ID` e
`META_AD_ACCOUNT_ID` definem a origem Meta. `PRESENTON_BASE_URL` deve apontar
para uma instancia local do Presenton; `PRESENTON_API_KEY` e opcional.
`PRESENTON_EXPORT_AS` deve permanecer `pptx`. Tokens ficam apenas no `.env`,
nao sao colocados em URLs, snapshots, briefings ou logs.

 ## Agendamento no Windows

 Com o Presenton disponivel localmente e o `.env` configurado, abra o PowerShell
 na raiz de `projects/instagram-presenton` e instale as duas tarefas:

 ```powershell
 .\scripts\install-scheduled-tasks.ps1
 ```

 Isso cria as tarefas `InstagramPresenton-Weekly` (toda segunda-feira as 08:00)
 e `InstagramPresenton-Monthly` (dia 1 de cada mes as 08:00). Os horarios usam
 o fuso horario local da maquina. Para remover as tarefas:

 ```powershell
 .\scripts\uninstall-scheduled-tasks.ps1
 ```

 A execucao semanal e mensal e registrada em `data/logs/`. A tarefa precisa ser
 instalada no mesmo computador em que o Presenton estiver disponivel localmente;
 o agendamento nao inicia uma instancia remota ou instala o Presenton.

  O pipeline e somente de leitura. Ele nao publica, edita, exclui ou gerencia
  anuncios na Meta. A apresentação gerada é somente um arquivo PPTX local.
