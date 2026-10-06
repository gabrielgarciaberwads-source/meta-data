# Monthly Strategic Update Report

Date: 2026-08-04

## Implemented

- Monthly flow now collects Instagram account insights with Meta Graph API GET requests only.
- Account metrics are requested independently, with Graph API `metric_type=total_value` where required.
- `follows_and_unfollows` is normalized into `follows`, `unfollows`, and derived `follower_growth`.
- Unsupported, empty, malformed, or permission-limited metrics remain `null` and produce warnings.
- Per-media organic insights, paid insights, organic/paid separation, and `paid_unmatched` were preserved.
- Monthly briefing now emits exactly the approved 11 headings in the required order.
- Monthly metric chains include what happened, comparison, strategic relevance, hypothesis, and next action.
- Weekly collection and its 8-slide structure remain unchanged.
- Presenton receives string content plus slide markdown and is limited to PPTX output.
- README, `.env.example`, and automated tests were updated. No runtime dependencies were added.

## Validation

- `npm test`: PASS, 60 tests.
- Monthly CLI with configured credentials: Meta collection completed and a token-free snapshot was persisted.
- Safe Presenton check: `PRESENTON_TIMEOUT_MS=1000 npm run instagram:present -- --window monthly` reached the local Presenton request and failed only because Presenton did not respond within the deliberately reduced timeout.
- An earlier default-timeout CLI attempt exceeded the shell's 120-second safety limit while waiting for the local Presenton generation; no secret was printed.

## Safety

- No Meta write operation was introduced.
- No Porter integration was used.
- Credentials were not included in this report, logs, snapshots, or briefing content.
