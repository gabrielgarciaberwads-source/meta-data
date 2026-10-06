# Paid Meta Workflows C3 Implementation Plan

> **For agentic workers:** Execute this plan inline; do not activate or publish either workflow.

**Goal:** Create two isolated n8n personal-space workflows for Meta Ads structure and daily Ads Insights ingestion into `meta_raw`.

**Architecture:** Both workflows use Manual Trigger, the two dedicated runtime credentials, Meta Graph API pagination, and PostgreSQL upserts. Collection runs and integration logs are written around endpoint calls; unsupported fields or breakdowns become warnings while raw responses remain available.

**Tech Stack:** n8n Workflow SDK, Meta Graph API, PostgreSQL, `America/Sao_Paulo` civil-date defaults.

## Global Constraints

- Names must start with `OWNERINC - META RAW -`.
- Use only PostgreSQL credential `Og0fnARJo2ylLGWW` and Meta credential `MGYzd9IzTNPC8EN2`.
- Account is `act_277127183253232`; writes are limited to schema `meta_raw`.
- Both workflows are manual, inactive/disabled, unpublished, and must not alter existing workflows.
- Do not create tables, schedules, SQL migrations, or credentials.
- Preserve `collection_run_id`, `raw_payload`, date boundaries, actions, and placement breakdowns.

## Task 1: Discover and validate n8n node contracts

- Read the n8n SDK reference and relevant workflow guidance.
- Discover Manual Trigger, HTTP Request/Meta Graph, Code or data transformation, PostgreSQL, and error/warning handling nodes.
- Retrieve exact node type definitions and credential parameter shapes.
- Validate each candidate node configuration before graph assembly.

## Task 2: Build and validate `OWNERINC - META RAW - Ads Structure Sync - C3`

- Build a manual workflow with endpoint pagination for campaigns, adsets, ads, and creatives.
- Use only read calls against `act_277127183253232`.
- Create collection-run bookkeeping, endpoint integration logs, normalized upserts, raw payload preservation, and partial/warning handling.
- Validate the complete workflow and credential IDs before saving.
- Create it only if no exact existing workflow is found; leave disabled/unpublished.

## Task 3: Build and validate `OWNERINC - META RAW - Ads Insights - C3`

- Build a manual workflow accepting explicit `date_start` and `date_stop`.
- Default both dates to the previous civil day in `America/Sao_Paulo`, without timestamp conversion of stored date values.
- Query ad-level insights with `publisher_platform` and `platform_position`, preserving `date_start`, `date_stop`, `actions`, and raw payload.
- Expand metric values into idempotent rows for `meta_raw.meta_paid_metrics`; log unsupported breakdown/field responses as warnings and retain raw data.
- Validate the complete workflow and credential IDs before saving.
- Create it only if no exact existing workflow is found; leave disabled/unpublished.

## Task 4: Verify outcome

- Re-read both saved workflows and verify exact names, IDs, active/disabled/published state, node names/types, and credential references.
- Run repository contract tests without touching database state.
- Report blockers, including any n8n SDK or credential/node limitations that prevent safe creation.
