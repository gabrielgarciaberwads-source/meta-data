# Dashboard deploy

O dashboard é um serviço separado do n8n e do PostgreSQL. A imagem é publicada
no GHCR e o deploy remoto atualiza somente `meta-raw-dashboard`; não executa
`docker compose up` no projeto do PostgreSQL e não reinicia n8n.

## Preparação única no VPS

As redes `meta_raw_internal` e `ownerinc_proxy` precisam existir antes do
primeiro deploy. A primeira é criada pelo Compose do PostgreSQL; a segunda é a
rede do proxy interno existente.

Criar, fora do Git, com permissão restrita:

`/opt/ownerinc/secrets/meta-raw-pipeline/dashboard.env`

Use [`deploy/dashboard.env.example`](../deploy/dashboard.env.example) como
formato. Preencha somente:

- `META_RAW_DB_NAME=meta_raw_pipeline`;
- `META_RAW_DB_USER=meta_raw_dashboard`;
- `META_RAW_DB_PASSWORD=<segredo protegido>`;
- limites de pool/timeouts, se necessário.

Depois, executar uma vez `deploy/provision-dashboard-readonly.sh` no VPS. O
script cria/atualiza somente a role `meta_raw_dashboard`, concede `CONNECT`,
`USAGE` e `SELECT`, remove privilégios de escrita e imprime apenas os estados
`DASHBOARD_ROLE_NON_PRIVILEGED` e `DASHBOARD_ROLE_READ_ONLY`.

O caminho da CA é fornecido pelo Compose e aponta para o certificado público
montado em read-only. Nunca copie `ca.key`, `server.key`, tokens Meta ou a
credencial n8n para o ambiente do dashboard.

O proxy interno deve encaminhar para `meta-raw-dashboard:4178` e aplicar a
camada de autenticação interna vigente antes de qualquer acesso humano. O
Compose não publica uma porta no host e o serviço não deve ser exposto
diretamente à internet.

## GitHub Environment `production`

Configure estes secrets no ambiente de produção, sem colocá-los em arquivos do
repositório:

- `OWNERINC_VPS_HOST`;
- `OWNERINC_VPS_USER`;
- `OWNERINC_VPS_SSH_KEY`;
- `OWNERINC_VPS_KNOWN_HOSTS` com a chave verificada do host;
- `OWNERINC_GHCR_READ_TOKEN`, limitado a leitura de packages.

A Action `.github/workflows/meta-raw-dashboard.yml` roda `npm run verify`,
publica uma imagem versionada pelo SHA e usa `deploy-dashboard.sh` por SSH.
Falhas de healthcheck interrompem o deploy. A ação não recebe nem imprime
segredos do Meta, n8n ou PostgreSQL.

## Rollback

Defina `DASHBOARD_IMAGE` para um SHA anterior e execute no VPS:

```sh
DASHBOARD_IMAGE=ghcr.io/gabrielgarciaberwads-source/meta-raw-dashboard:<sha-anterior> \
  /opt/ownerinc/apps/meta-raw-pipeline/deploy-dashboard.sh
```

Esse rollback substitui apenas o container do dashboard e mantém PostgreSQL,
n8n, histórico de execuções e workflows inalterados.
