# n8n Artifacts

Os workflows desta pasta serao importados no n8n somente depois que a
credencial PostgreSQL dedicada estiver criada:

```text
OWNERINC - META RAW - META GRAPH API - RUNTIME V1
OWNERINC - META RAW - POSTGRES - RUNTIME V1
```

Nao reutilizar credenciais de Leads, Nest ou outros produtos.

Os workflows novos devem:

- usar os IDs de `ownerinc.gramado` e `act_277127183253232` definidos no
  contrato do projeto;
- permanecer inativos na primeira importacao;
- gravar no schema `meta_raw`;
- registrar `collection_run_id` e `raw_payload`;
- tratar paginacao antes do upsert;
- nunca escrever token em dados, parametros persistidos ou logs.

## C1 Media Discovery

O workflow de Media Discovery usa janelas temporais de 30 dias (`since`/`until`)
e limita a paginação interna a 100 paginas por execucao. O endpoint `/media`
possui limite historico de conteudos e uma coleta sem janela pode exceder o
timeout do n8n; por isso, cada execucao e delimitada por periodo.

Antes de iniciar uma nova coleta, o workflow reconcilia `collection_runs` antigas
que ainda estejam `RUNNING` por mais de 20 minutos, marcando-as como `FAILED`.
Se a ultima pagina ainda retornar `paging.next`, a execucao e marcada como
`PARTIAL`, nunca como `SUCCEEDED`.

A paginação usa o cursor `after` em vez de persistir ou reutilizar a URL
`paging.next`, evitando repetir a mesma resposta quando a janela temporal está
ativa. Mensagens de erro são normalizadas antes do uso como parâmetros SQL e o
fechamento como `FAILED` não depende do sucesso secundário do log.

## API REST do n8n

O projeto usa a API REST do n8n com `X-N8N-API-KEY`. Nao salve a chave no
repositorio; ela fica no `.env` local, que e ignorado pelo Git.

```text
https://n8n.ownerinc.com.br/api/v1
```

Variaveis locais:

```text
N8N_BASE_URL=https://n8n.ownerinc.com.br
N8N_API_KEY=<API key REST do n8n>
```

As chamadas devem enviar a chave no header `X-N8N-API-KEY`. O endpoint de
teste usado na configuracao foi `GET /api/v1/workflows?limit=1`.

O endpoint base e:

```text
https://n8n.ownerinc.com.br/api/v1
```

O SQL em `../sql/001_initial_schema.sql` deve ser executado no PostgreSQL
dedicado antes da ativacao dos workflows.
