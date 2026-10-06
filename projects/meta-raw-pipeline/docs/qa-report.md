# QA Report

## Result

`PASS — structural draft validation; live QA remains PARTIAL`

This is not an execution approval or release authorization. Structural checks and
controlled live QA are reported separately; aggregate live evidence is maintained
in [`qa-live-report.md`](qa-live-report.md). No payload or response body is
reproduced here.

## Audited workflows

| Workflow | ID | State |
|---|---|---|
| Media Discovery - C1 | `6Lu7bCvKPMMJKkfE` | inactive, unpublished |
| Stories Discovery - C2 | `F5wU8CN34kHSYfqd` | inactive, unpublished |
| Stories Insights - C2 | `NJ3gwPPWyUMAQTPM` | inactive, unpublished |
| Collaborative Media - C2 | `txQorqTsuTEPasfb` | inactive, unpublished |
| Ads Structure Sync - C3 | `RZx96pisAg2i9DaQ` | inactive, unpublished |
| Ads Insights - C3 | `lOJbgByhiMzdOTNq` | inactive, unpublished |

## Checks passed

- Graph endpoints and account IDs match the approved scope.
- Organic and paid workflows remain separated.
- Pagination uses `after` only to request the next page and `paging.next` as
  the completion signal; legacy duplicate pagination fields were removed.
- C2 graph paths do not duplicate normalization/upsert execution.
- Collaborative Media aggregates all returned media pages and records explicit
  `FAILED`, `PARTIAL`, or `SUCCEEDED` outcomes.
- Ads Structure covers campaigns, adsets, ads, and creatives, including
  `effective_object_story_id`.
- Ads Insights supports internal callable input for explicit `date_start` and
  `date_stop`, validates the date range, and defaults to the previous civil day
  in `America/Sao_Paulo`.
- `raw_payload`, `collection_run_id`, idempotent keys, and integration logs are
  present in the workflow graphs.
- Local contract test: `npm test` — 14 passed, 0 failed.
- Workflow exports in `n8n/workflows/` parse successfully and preserve the
  inactive/unpublished state.

## Warnings

- n8n's sanitized metadata reports `triggerCount=0` even though the graphs
  contain manual/internal trigger nodes.
- Individual node `disabled` flags are not exposed by the sanitized API; global
  workflow state is confirmed by `active=false` and `activeVersionId=null`.
- Retry/backoff is not consistently configured on every HTTP node.
- C1 has five historical manual executions from earlier work (two success, two
  canceled, one error); no execution was started by this audit. C2 and C3 have
  no historical executions.

## Live QA status

The controlled live QA procedure is documented in
[`qa-live-runbook.md`](qa-live-runbook.md), with an aggregate-only report at
[`qa-live-report.md`](qa-live-report.md). TLS and all six manual workflow paths
were exercised on the VPS. C1, Stories Discovery, Collaborative Media, and Ads
Structure succeeded; Stories Insights and Ads Insights remain explicitly
`PARTIAL` because of unavailable metrics and the configured pagination safety
limit. No payloads or execution response bodies belong in the report.

## Gate

QA approves the draft structure for security review. Publication, activation,
and production dashboard deployment remain blocked until the partial live QA is
accepted, the pre-existing alert workflow is scoped, and explicit user release
authorization is recorded.
