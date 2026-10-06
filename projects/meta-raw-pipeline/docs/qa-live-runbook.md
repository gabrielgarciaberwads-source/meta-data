# Live QA Runbook — Meta Raw Pipeline

## Purpose and safety boundary

This runbook is for one controlled validation window after PostgreSQL TLS has
been configured on the VPS. It does not authorize publication, scheduling,
activation, credential rotation outside the dedicated PostgreSQL credential, or
changes to the pre-existing alert workflow.

The only approved data path is:

```text
Meta Graph API → n8n manual workflow → dedicated meta_raw PostgreSQL
```

Do not download execution data, export n8n runs, copy payloads into reports,
send results to GitHub or third parties, or include database rows in chat.
Capture only status, authorized run identifiers, aggregate counts, periods, and
sanitized error codes.

## Preconditions

1. The dedicated PostgreSQL Compose project has no host `5432` mapping.
2. `deploy/provision-postgres-tls.sh` has produced TLS material on the VPS.
3. Only `server/ca.crt` is mounted read-only into n8n.
4. The dedicated PostgreSQL credential `OWNERINC - META RAW - POSTGRES - RUNTIME V1` (`Og0fnARJo2ylLGWW`) has TLS enabled and trusts the internal CA.
5. `deploy/verify-postgres-tls.sh` prints `TLS_VERIFY_OK`.
6. All six new workflows are still manual, inactive, and unpublished.
7. The Meta credential remains read-only and scoped to the approved Instagram account and Ads account.

If any precondition fails, stop and record `BLOCKED_EXTERNAL` or
`BLOCKED_SECURITY` in the live report. Do not compensate by disabling TLS or
activating a workflow.

## Controlled restart order

1. Record service names, health states, image names, network names, and published
   ports only. Never print Compose environment files or `docker inspect` env
   arrays.
2. Run the TLS provisioner on the VPS as the protected operator.
3. Recreate only `meta-raw-postgres` and wait for its healthcheck.
4. Mount the public CA into n8n and update only the dedicated PostgreSQL
   credential. Do not print the password or certificate contents.
5. Restart only the n8n service.
6. Run the TLS verifier from the VPS and retain only its status markers.
7. Open each workflow in the n8n UI and run it manually, one at a time.

## Workflow matrix

| Order | Workflow | ID | Input boundary | Aggregate evidence |
|---:|---|---|---|---|
| 1 | Media Discovery - C1 | `6Lu7bCvKPMMJKkfE` | Instagram `17841449595671459`, bounded 30-day window | run status, period, media count, `collection_run_id` |
| 2 | Stories Discovery - C2 | `F5wU8CN34kHSYfqd` | Instagram `17841449595671459` | run status, story count, `collection_run_id` |
| 3 | Stories Insights - C2 | `NJ3gwPPWyUMAQTPM` | Instagram `17841449595671459` | metric status counts, `integration_logs` aggregate |
| 4 | Collaborative Media - C2 | `txQorqTsuTEPasfb` | Instagram `17841449595671459` | collaborator count, run status |
| 5 | Ads Structure Sync - C3 | `RZx96pisAg2i9DaQ` | Ads `act_277127183253232` | campaign/adset/ad/creative counts |
| 6 | Ads Insights - C3 | `lOJbgByhiMzdOTNq` | Ads `act_277127183253232`, explicit `date_start`/`date_stop` | metric row count, period, run status |

Before each run, confirm the UI still shows the workflow as manual and
inactive. For Ads Insights, enter the approved test period explicitly and
record only the dates, not response data. After each run, record success,
partial, or failure and stop if an unexpected destination or credential is
observed.

## Aggregate-only SQL evidence

Execute these queries from the protected VPS session using the dedicated app
role where possible. Bind values interactively; do not write live IDs or counts
back into this repository unless they are authorized aggregate evidence.

### Collection runs

```sql
SELECT workflow_name, source, status, period_start, period_end,
       records_requested, records_received, records_inserted,
       records_updated, error_count
FROM meta_raw.collection_runs
ORDER BY started_at DESC
LIMIT 20;
```

### Integration log aggregates

```sql
SELECT collection_run_id, workflow_name, status, count(*) AS log_count,
       count(*) FILTER (WHERE status = 'ERROR') AS error_count
FROM meta_raw.integration_logs
GROUP BY collection_run_id, workflow_name, status
ORDER BY max(started_at) DESC;
```

Do not select `error_message`. Record only the normalized error code and status.

### Organic row counts

```sql
SELECT 'instagram_media' AS table_name, count(*) AS row_count
FROM meta_raw.instagram_media
WHERE account_id = $1
UNION ALL
SELECT 'instagram_organic_metrics', count(*)
FROM meta_raw.instagram_organic_metrics
WHERE account_id = $1
UNION ALL
SELECT 'instagram_stories', count(*)
FROM meta_raw.instagram_stories
WHERE account_id = $1
UNION ALL
SELECT 'instagram_story_metrics', count(*)
FROM meta_raw.instagram_story_metrics
WHERE account_id = $1
UNION ALL
SELECT 'instagram_media_collaborators', count(*)
FROM meta_raw.instagram_media_collaborators
WHERE account_id = $1;
```

### Paid row counts

```sql
SELECT 'meta_campaigns' AS table_name, count(*) AS row_count
FROM meta_raw.meta_campaigns
WHERE ad_account_id = $1
UNION ALL
SELECT 'meta_adsets', count(*)
FROM meta_raw.meta_adsets
WHERE ad_account_id = $1
UNION ALL
SELECT 'meta_ads', count(*)
FROM meta_raw.meta_ads
WHERE ad_account_id = $1
UNION ALL
SELECT 'meta_creatives', count(*)
FROM meta_raw.meta_creatives
WHERE ad_account_id = $1
UNION ALL
SELECT 'meta_paid_metrics', count(*)
FROM meta_raw.meta_paid_metrics
WHERE ad_account_id = $1 AND date_start >= $2 AND date_stop <= $3;
```

### Secret-shaped content counts

The query returns only a number. Never print matching text or the source row.

```sql
SELECT 'instagram_media' AS table_name, count(*) AS suspicious_count
FROM meta_raw.instagram_media
WHERE raw_payload::text ~* '(access_token|password|secret|private_key)'
UNION ALL
SELECT 'instagram_organic_metrics', count(*)
FROM meta_raw.instagram_organic_metrics
WHERE raw_payload::text ~* '(access_token|password|secret|private_key)'
UNION ALL
SELECT 'meta_paid_metrics', count(*)
FROM meta_raw.meta_paid_metrics
WHERE raw_payload::text ~* '(access_token|password|secret|private_key)';
```

Run the equivalent check on `integration_logs` using `error_code` only. Never
select or store `error_message` in the report.

### Idempotency checks

Run after the first successful or partial collection and once again after a
safe manual repetition. Every duplicate count must be zero:

```sql
SELECT count(*) - count(DISTINCT (account_id, instagram_media_id)) AS duplicate_media_keys
FROM meta_raw.instagram_media
WHERE account_id = $1;

SELECT count(*) - count(DISTINCT (account_id, instagram_media_id, metric_name, observed_at)) AS duplicate_organic_metric_keys
FROM meta_raw.instagram_organic_metrics
WHERE account_id = $1;

SELECT count(*) - count(DISTINCT (ad_account_id, date_start, date_stop, campaign_id, adset_id, ad_id, creative_id, publisher_platform, platform_position, metric_name)) AS duplicate_paid_metric_keys
FROM meta_raw.meta_paid_metrics
WHERE ad_account_id = $1 AND date_start >= $2 AND date_stop <= $3;
```

## Completion rule

Mark the live QA gate `PASS` only when TLS is verified, the intended rows and
logs exist, account/period boundaries match, suspicious-content counts are
zero, idempotency checks are zero, and no unexpected destination was observed.
Use `PARTIAL` when the workflow reports partial coverage but the data path is
safe. Use `BLOCKED_EXTERNAL` when the VPS/n8n access or required credential is
not available. None of these states authorizes publication or activation.
