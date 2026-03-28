# Auth Email Delivery

SundayEmpire supports three outbound auth/invite delivery modes:

- Provider delivery for staging or production-capable environments
- Local/test capture for deterministic QA and Playwright flows
- Optional console logging for local development

Provider delivery is opt-in. Local and test environments do not send real email unless explicitly configured, and `NODE_ENV=test` always disables provider sending even if provider flags are set.

## Required Configuration

Provider-backed delivery uses these environment variables:

- `AUTH_EMAIL_PROVIDER_ENABLED=1`
- `AUTH_EMAIL_PROVIDER=resend`
- `AUTH_EMAIL_PROVIDER_API_KEY=...`
- `AUTH_EMAIL_FROM_EMAIL=noreply@example.com`

Optional configuration:

- `AUTH_EMAIL_FROM_NAME=SundayEmpire`
- `AUTH_EMAIL_REPLY_TO=support@example.com`
- `AUTH_APP_BASE_URL=https://league.sundayempire.com`

`AUTH_APP_BASE_URL` lets auth and invite emails generate links against a stable public origin instead of the current request origin.

## Local And Test Delivery

Capture and debug modes remain explicitly gated:

- `AUTH_MAGIC_LINK_TEST_CAPTURE=1`
- `AUTH_INVITE_TEST_CAPTURE=1`
- `AUTH_MAGIC_LINK_CONSOLE_LOG=1`
- `AUTH_INVITE_CONSOLE_LOG=1`

Capture routes remain test-gated and are still the supported path for CI and Playwright to retrieve invite and magic-link URLs.

## Invite Delivery Recovery

League invites now persist a minimal last-attempt delivery record so commissioner invite management can show whether the latest invite email was sent, captured, logged locally, failed, or unavailable because delivery is not configured.

Those operator-facing states never expose raw invite tokens or provider payloads. They only show safe guidance such as whether the invite is still valid and whether resend is the next recovery step.

## Safety Notes

- Magic-link and invite tokens remain opaque and are only stored as hashes in the database.
- General logs do not include raw invite or magic-link URLs.
- Commissioner invite list APIs do not expose plaintext tokens or delivery internals beyond high-level delivery summaries.
