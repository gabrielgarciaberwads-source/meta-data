# VPS deployment

The PostgreSQL service is deployed as a separate Compose project on the VPS.
The Compose file intentionally publishes no host port. The database is reachable
only from the private `meta_raw_internal` network and from n8n's existing
`n8n_internal` network, using the `meta-raw-postgres` hostname.

Secrets live outside the repository:

```text
/opt/ownerinc/secrets/meta-raw-pipeline/postgres-admin.env
/opt/ownerinc/secrets/meta-raw-pipeline/app.env
```

The application role is separate from the bootstrap administrator. The n8n
credential must use the application role, never the bootstrap administrator.

## PostgreSQL TLS

The PostgreSQL service requires TLS for TCP clients. The server Compose project
mounts only the server-side directory below into the container; the CA private
key remains in the sibling `private` directory on the VPS and is never mounted
into n8n or the dashboard:

```text
/opt/ownerinc/secrets/meta-raw-pipeline/tls/private/ca.key
/opt/ownerinc/secrets/meta-raw-pipeline/tls/server/ca.crt
/opt/ownerinc/secrets/meta-raw-pipeline/tls/server/server.crt
/opt/ownerinc/secrets/meta-raw-pipeline/tls/server/server.key
/opt/ownerinc/secrets/meta-raw-pipeline/tls/server/pg_hba.conf
```

Run `provision-postgres-tls.sh` as the protected VPS operator. It creates the
CA and server certificate only when absent, refuses near-expiry material, and
prints certificate subject/expiry metadata but never key contents. The server
key is owned by the PostgreSQL container user and has mode `600`.

The n8n container and the future dashboard container receive only
`server/ca.crt` as a read-only mount. The dedicated n8n PostgreSQL credential
must enable TLS and validate this CA. Do not copy the CA private key into n8n,
GitHub Actions, the repository, or the dashboard image.

After provisioning, recreate only `meta-raw-postgres`, wait for its healthcheck,
then run `verify-postgres-tls.sh`. The verifier prints status markers only. A
failed TLS check blocks workflow QA.

The database data volume is:

```text
/opt/ownerinc/apps/meta-raw-pipeline/postgres
```
