# WyDev Production Deployment

## Architecture
- Frontend: Vite static build deployed on Vercel.
- Backend: exactly one Vercel Serverless Function: `api/index.js`.
- GitHub: source of truth for repositories and commits.
- Firebase Firestore: durable entitlement, transaction and AI quota state only.
- Flutterwave v4: payment processing.
- OpenAI: diagnosis only.

## Vercel
Set:
- Build Command: `npm run build:source`
- Output Directory: `dist`
- Node.js runtime compatible with the package lock.

The included `vercel.json` routes `/api/*` to the single gateway.

## Required environment variables
See `.env.example`.

Server-only secrets:
- `GITHUB_CLIENT_SECRET`
- `SESSION_SECRET`
- `OPENAI_API_KEY`
- `FLW_CLIENT_SECRET`
- `FLW_WEBHOOK_SECRET_HASH`
- `FIREBASE_PRIVATE_KEY`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (recommended alternative to the individual Firebase service-account fields; set either this JSON or the individual fields)

Browser-safe:
- `VITE_API_BASE_URL`
- `FLW_ENCRYPTION_KEY`

Never prefix server secrets with `VITE_`.

## GitHub OAuth
Register the production callback:
`https://YOUR_DOMAIN/api/auth/github/callback`

Use the minimum GitHub permissions required by the application. Never put the GitHub client secret in frontend code.

## Firebase
Create Firestore and a server-side service account. Keep direct client Firestore access disabled. The Admin SDK is used by the single backend gateway.

Collections:
- `wydev_entitlements`
- `wydev_transactions`
- `wydev_ai_usage`

No repository source is intentionally stored in Firestore.

## Flutterwave
Use sandbox first. Configure the production callback/redirect URL required by the selected v4 payment flow. Set the merchant encryption key as `FLW_ENCRYPTION_KEY`. WyDev reads it server-side through `/billing/config`, so no `VITE_`-prefixed Flutterwave encryption variable is required in Vercel.

Never activate Pro from a frontend redirect alone. The gateway verifies the payment and/or processes a trusted webhook.

## OpenAI
Keep model IDs configurable through environment variables. The application uses cheap-model-first routing and escalates only when validation, confidence, timeout, or provider failure requires it.

## Pre-launch checklist
1. Run `npm run check`.
2. Run `npm run build:source`.
3. Deploy to Vercel preview.
4. Test GitHub OAuth with a private repository.
5. Test create/edit/delete/rename/upload operations.
6. Test remote-branch conflict protection.
7. Test AI diagnosis and quota exhaustion.
8. Test Flutterwave sandbox payment + webhook + duplicate webhook.
9. Confirm Firebase records persist across separate invocations.
10. Test on a physical Android phone.
11. Rotate sandbox secrets before production.
12. Add the production OAuth callback before switching GitHub/Flutterwave to production.
