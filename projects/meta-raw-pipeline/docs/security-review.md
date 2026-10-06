# Security Review

## Status

`CONDITIONAL — not a release approval`

The automated review confirms the safe configuration, but live QA remains
conditional and operational decisions remain open before any workflow can be
published or activated:

1. accept the partial live QA, including unavailable Stories metrics and the Ads
   Insights pagination safety limit;
2. decide how to treat the pre-existing active workflow
   `OWNERINC - META RAW - ALERTAS EMAIL - V1` (`VINcnSznzDtpEUu4`).

This file does not authorize execution, publication, activation, or deletion of
execution history.

## Evidence reviewed

- Dedicated PostgreSQL container `meta-raw-postgres`.
- No host port is published for PostgreSQL; access is through the private
  `meta_raw_internal` and controlled `n8n_internal` Docker networks.
- Dedicated database, schema, volume, and application role.
- Application role validated without superuser, `CREATEDB`, or `CREATEROLE`,
  and without schema `CREATE` permission.
- Dashboard role `meta_raw_dashboard` validated with `SELECT` only; its live
  TLS login returned `t|f|f|f` for `SELECT|INSERT|UPDATE|DELETE` privileges.
- Dedicated n8n credentials:
  - Meta Graph API: `MGYzd9IzTNPC8EN2`;
  - PostgreSQL: `Og0fnARJo2ylLGWW`.
- Direct n8n REST inspection confirms the six new workflows bind their HTTP
  nodes to the dedicated Meta credential and their PostgreSQL nodes to the
  dedicated PostgreSQL credential.
- Graph API credential is restricted to `graph.facebook.com`.
- Workflow exports contain no access token, password, private key, or database
  connection string. Error handling redacts token-shaped query parameters.
- New workflows use read-only Graph API methods, remain `active=false`, and
  have `activeVersionId=null`.
- Ads Insights' additional `executeWorkflowTrigger` is internal and does not
  create a public webhook URL.
- Static repository and contract tests pass.
- VPS TLS verifier returned `TLS_VERIFY_OK` after PostgreSQL restart; n8n has a
  read-only CA bundle mounted and the dedicated credential uses `ssl=require`
  with certificate verification enabled.

## Open risks and decisions

### Internal PostgreSQL transport

The repository contains a VPS-only TLS provisioner and Compose configuration that
requires `ssl=on` and `hostssl`, while preserving the absence of a published host
port. The VPS certificate, n8n trust mount, dedicated credential update, and
handshake were verified. Full security acceptance remains blocked by the partial
live QA and the pre-existing active alert workflow.

### Existing alert workflow

`OWNERINC - META RAW - ALERTAS EMAIL - V1` predates the final workflow gate and
is active/published. It was not changed because changing an existing workflow
without explicit authorization would violate the isolation rule. It must either
be excluded from the release scope with documented ownership, or be separately
reviewed and deactivated by an authorized operator.

### Historical C1 executions

The n8n release recheck found five historical manual executions for C1. They
were not started by this review and were not deleted. C2 and C3 have no
historical executions. This does not constitute current activation.

## Release condition

Release remains blocked until QA approval, security acceptance of the two open
items above, and explicit user authorization are recorded together. No secret
values belong in this document or in the repository.
