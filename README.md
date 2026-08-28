# WyDev — GitHub + AI + Flutterwave build

Mobile-first GitHub code editor/workspace. GitHub remains the source of truth.

## Included in this build

- One consolidated Vercel serverless gateway: `api/index.js`
- Secure GitHub OAuth web flow with HttpOnly encrypted session cookie
- GitHub repository listing, branch/tree/file reads
- Atomic Git Data API commit/push using one commit
- Remote branch SHA check before push; returns HTTP 409 instead of overwriting newer work
- Local working state and folder rename preview/reference scan
- Folder upload with generated-file skips
- AI diagnosis endpoint with structured JSON validation, cheap-model-first fallback and per-user daily quota
- Flutterwave v4 OAuth authentication, v4 direct-charge endpoint, webhook signature verification, server-side transaction verification and entitlement checks
- Billing UI intentionally does not enable raw card collection until the merchant's Flutterwave v4 client encryption key/flow is wired. Do not collect card data through `prompt()` in production.

## Important production notes

The v4 Flutterwave API uses OAuth 2.0 bearer access tokens, idempotency/trace headers, and webhook verification. Configure the v4 sandbox first. The backend never stores raw card details.

For durable Pro entitlements and AI usage across Vercel instances, connect a small database/KV through the same gateway. The included in-memory fallback is for development only.

### Environment variables

Copy `.env.example` to your deployment settings and set:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REDIRECT_URI`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_MODEL_PRIMARY`
- `OPENAI_MODEL_FALLBACK`
- `FLW_CLIENT_ID`
- `FLW_CLIENT_SECRET`
- `FLW_WEBHOOK_SECRET_HASH`
- `FLW_ENV`
- `FLW_PRO_USD`
- `FLW_PRO_NGN`

Never commit secrets.

## Run

npm install
npm run dev

## Build

npm run build

## GitHub OAuth

Create a GitHub OAuth App and set its callback URL to `/api/auth/github/callback` on the deployed origin. The app requests `read:user repo` because private repository editing requires repository write access.

## Flutterwave

Use v4 sandbox credentials first. Configure the webhook URL as:

`https://YOUR_DOMAIN/api/billing/webhook`

The backend verifies webhook signatures and then re-queries the charge before activating Pro.

The current Flutterwave v4 docs use OAuth 2.0 and v4 endpoints rather than the older v3 secret-key checkout flow.

## Firebase persistence

Firebase is used as the durable state layer, not as Git hosting. The app stores only:
- `wydev_entitlements/{githubUserId}` — Pro entitlement and expiry
- `wydev_transactions/{reference}` — payment metadata needed for verification/idempotency
- `wydev_ai_usage/{githubUserId_YYYY-MM-DD}` — daily AI count

No repository source is persisted to Firestore by this build. Local project content remains on the device.

Create a Firebase project, enable Firestore, create a service account, and add:
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

The Firebase Admin credentials are server-only. Do not put them in `VITE_*` variables.

## Flutterwave v4 card encryption

The browser encrypts card number, expiry month/year and CVV with the Flutterwave AES-256 encryption key before the request reaches the WyDev backend. Flutterwave's current v4 docs require encrypted card fields plus a 12-character nonce. The backend then sends only encrypted card data to Flutterwave.

Set the merchant encryption key as:
`FLW_ENCRYPTION_KEY`

WyDev reads this server environment variable through `/billing/config` so the Vite frontend does not require a `VITE_`-prefixed environment variable.

This is deliberately different from `FLW_CLIENT_SECRET`. Never put `FLW_CLIENT_SECRET` in a VITE variable.

The frontend also supports Flutterwave's returned authorization redirect (for 3DS/VBV). Pro is granted only after a verified successful charge/webhook, not merely after returning to the app.

## Production persistence requirement

Firestore removes the Vercel in-memory state problem for AI quotas, transaction records and Pro entitlements. GitHub source remains remote; WyDev does not turn Firestore into another Git host.

Recommended Firestore rules: deny all direct client reads/writes and access these collections only through the Admin SDK server gateway.


### Flutterwave v4 troubleshooting

WyDev generates alphanumeric `X-Trace-Id` and `X-Idempotency-Key` values as required by Flutterwave v4. A `10403 FORBIDDEN` response is surfaced with the endpoint, environment, and trace ID so the account/API permission issue can be identified without exposing credentials.
