# App Store authentication update — October 2, 2026

Welcome keeps email magic-link sign-in as its default. A visible, expandable
**Sign in with password** option now accepts the email and current password of
an existing Supabase account through `auth.signInWithPassword`. It uses the
ordinary session listener, onboarding gate, routes and permissions. There is no
review-only bypass, embedded credential, special role or password creation/reset
in this change. Password input remains local form state and is cleared after a
successful sign-in; the component does not log or persist credentials.

App Review access requires a real confirmed account with a password, suitable
content and ordinary limited permissions. Supply its credentials only through
App Store Connect's protected review-access fields. Do not commit credentials to
the repository. Provisioning and real native password sign-in are separate
release checks; mocked browser success does not establish those outcomes.
[Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)

## Native email callback correction

Hosted read-only Auth logs showed one successful OTP request followed by an
email-rate-limit rejection and a verified email redirect, with no token exchange.
Simulator storage retained scoped PKCE verifiers but had no legacy verifier or
session. The installed SDK creates a new verifier before a resend and removes
that resend's legacy verifier when sending fails. A code-only native exchange
therefore cannot find the verifier for the earlier delivered email.

Native client initialization now opts into
`experimental.appendPkceFlowIdToRedirects`. The native parser accepts only the
configured callback path, a bounded query-only `code` and optional query-only
`sb_flow_id` matching `[A-Za-z0-9_-]{8,64}`. Duplicate parameters, unknown
parameters, fragment codes/flow IDs and error/code combinations are rejected.
The handler exchanges the code with its matching flow ID and never installs
tokens from a link. Older code-only callbacks remain supported.

The hosted redirect allowlist must retain the exact native callback and include
the narrowly scoped literal-query pattern
`com.aaronpilk.sidequest://auth/callback\?sb_flow_id=*`, preserving existing web
callbacks. The SDK version remains pinned at `2.117.2`; overlapping-flow support
is an explicitly documented experimental API.
[Supabase PKCE flows](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

## Email delivery limits

Welcome prevents rapid resends for 60 seconds using an absolute deadline. That
timer does not promise email delivery: Supabase's built-in email service has a
separate project quota, and an email-rate-limit response can persist longer.
The app now says delivery is temporarily limited and directs people to use an
existing newest link or try later. Public email delivery/custom SMTP readiness
must be checked separately before release.
[Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)

## Automated evidence

- `tests/native-pkce-resend.test.ts` runs the installed Supabase SDK with a
  mocked transport: first OTP succeeds, resend returns 429, and the first
  correlated callback establishes a session despite the missing legacy verifier.
- Native callback tests cover strict flow-ID validation and event deduplication.
- Browser tests cover resend prevention, delivery-limit recovery, normal
  password authentication, generic failures, duplicate-submit protection and
  narrow-screen layout.

Real device/Simulator email and password sign-in, public SMTP delivery and final
reviewer access must be reported separately from these automated checks.
