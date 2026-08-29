# WyBuild

WyBuild is a GitHub-powered Android build and release interface. It keeps source code in GitHub and runs builds in GitHub Actions; Vercel hosts the web/API layer.

## Stack

- React + Vite
- Vercel Node function (`api/index.js`)
- GitHub OAuth + REST API + Actions
- GitHub Actions for isolated builds
- WyDev for Flutterwave billing authority

## Current supported build path

The production-safe core path is:

**GitHub OAuth → repository → branch → WyBuild workflow → GitHub Actions → APK/AAB artifact → optional GitHub Release**

The selected repository must contain an Android Gradle project (`gradlew`). If the workflow is missing, WyBuild can create a separate `wybuild/setup-*` branch containing the workflow so the user can review it before merging.

WyBuild does not silently modify the default branch.

## Local setup

1. Install Node 20.19+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Fill in the GitHub OAuth and session variables.
5. Set the WyDev billing variables only when the WyDev entitlement API is available.
6. Run `npm run dev`.

## GitHub OAuth App

Create a GitHub OAuth App and set its authorization callback URL to:

`https://YOUR-VERCEL-DOMAIN/api/auth/github/callback`

The OAuth application needs access appropriate to the operations you enable. The current workflow installation/build flow requires repository write access because it can create a separate setup branch and add `.github/workflows/wybuild.yml`. Review GitHub's permission screen before authorizing.

## Vercel

Use the repository root as the Vercel project root. Vercel should detect Vite automatically:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js: 20.19+ (the package declares the engine requirement)

The API is consolidated in `api/index.js`; do not add a separate Vercel function for every endpoint.

## WyDev billing

WyDev is the only Flutterwave billing authority. WyBuild does not initialize Flutterwave transactions, verify Flutterwave transactions, or receive a Flutterwave webhook. It only reads the server-confirmed entitlement exposed by WyDev.

## Security

Never commit `.env`, GitHub client secrets, WyDev service tokens, signing credentials, or private keys. GitHub OAuth tokens are kept server-side in an encrypted HttpOnly session cookie.

## Validation

Run:

`npm run build`

before deployment. The repository also contains a GitHub Actions workflow used by WyBuild builds.

## PWA
WyBuild is installable as a Progressive Web App. The manifest, service worker, and icons live in `public/` — Vite copies that directory verbatim in both `npm run dev` and `npm run build`, so the install prompt and icons work identically in local development and production.

## Billing authority
Flutterwave is handled by WyDev. Configure `WYDEV_BILLING_API_URL`, `WYDEV_BILLING_SERVICE_TOKEN`, and `WYDEV_BILLING_URL` only when the corresponding WyDev endpoints exist. WyBuild never treats a frontend flag as proof of payment.
