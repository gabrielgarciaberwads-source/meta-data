# Live QA Report — Meta Raw Pipeline

## Reporting boundary

This report stores aggregate evidence only. Do not add payloads, response bodies,
tokens, passwords, certificate material, database connection strings, raw error
messages, or screenshots containing production data.

## Current state

`PARTIAL` — all authorized manual QA workflows were executed without a stuck
current run. C1, Stories Discovery, Collaborative Media, and Ads Structure
completed successfully; Stories Insights completed with explicit unavailable
metrics and Ads Insights completed with the configured pagination safety limit.

## Gate checklist

| Check | State | Aggregate evidence |
|---|---|---|
| PostgreSQL TLS handshake | `PASS` | `TLS_VERIFY_OK` |
| No public PostgreSQL port | `PASS` | container exposes `5432/tcp` without host mapping |
| Dedicated PostgreSQL role | `PASS` | `POSTGRES_HOSTSSL_ENFORCED`, `APP_ROLE_NON_PRIVILEGED` |
| C1 Media Discovery | `PASS` | `SUCCEEDED`, 8 received, 0 inserted, 8 updated |
| C2 Stories Discovery | `PASS` | `SUCCEEDED`, 6 stories |
| C2 Stories Insights | `PARTIAL` | `PARTIAL`, 18 snapshots, 2 Stories with available metrics, 4 with `UNAVAILABLE`, one sanitized warning |
| C2 Collaborative Media | `PASS` | `SUCCEEDED`, 0 collaborative media, one explicit `UNSUPPORTED_OR_EMPTY` warning |
| C3 Ads Structure | `PASS` | `SUCCEEDED`, 27 campaigns, 182 adsets, 1,013 ads, 3,120 creatives |
| C3 Ads Insights | `PARTIAL` | `PARTIAL`, 100 response rows / 323 metric rows, pagination safety limit warning |
| Integration logs | `PASS_WITH_WARNINGS` | current runs have sanitized endpoint logs; no stuck run remains |
| Secret-shaped payload count | `PASS` | 0 across inspected Organic, Stories, Ads Structure, and Paid metrics |
| Idempotency | `PASS` | 0 duplicate media keys after C1 rerun |
| Unexpected destinations | `NOT_RUN` | boolean and sanitized note |

## Authorized identifiers

Only these live identifiers are included:

- C1 first run: `04be830f-098d-4981-892c-afd7fc90d401`;
- C1 idempotency rerun: `844f6f57-57df-4989-b8b9-f86bfcfe0632`;
- C2 Stories Discovery: `8602ad53-7633-4e92-9608-7129865ded21`;
- C2 Stories Insights blocked run: `af164d4e-e3c5-49f9-b4e0-f399266bbff3`;
- C2 Stories Insights validated run: `9811fd26-7507-4388-ab23-ecd538a74d9c`;
- C2 Collaborative Media validated run: `cc66f7a6-7804-494e-ab95-381cf7955065`;
- C3 Ads Structure validated run: `71db68e1-6ffa-447d-b097-90282cc4dba9`;
- C3 Ads Insights validated run: `dec39c69-9320-41c7-a02f-09c8eaf5c0b1`.

Do not paste n8n execution JSON here.

## Decision

`PARTIAL` — no release or activation decision. Stories Insights and Ads Insights
retain explicit partial coverage and must remain visible as such in the
dashboard. The six new workflows remain manual, inactive, and unpublished;
the existing alert workflow was not altered.
