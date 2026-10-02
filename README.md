# WyBuild — Developer Android build assistant

WyBuild connects GitHub repositories to repeatable GitHub Actions builds and checks common project setup issues before building.

## GitHub OAuth setup

The **Connect GitHub** button starts the GitHub OAuth web flow at `https://github.com/login/oauth/authorize`. If WyBuild shows `GITHUB_OAUTH_NOT_CONFIGURED` before GitHub opens, the deployment is missing `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, or `SESSION_SECRET`. Set them in Vercel and redeploy.

For production, set `GITHUB_CALLBACK_URL` to the exact callback registered in the GitHub OAuth App, for example `https://your-domain.example/api/auth/github/callback`. GitHub requires the redirect URI supplied by the app to match a registered callback URL. citeturn0search3turn0search6

## Free developer scope

- Flutter and existing Android/Gradle APK+AAB builds (the default Auto Detect target produces both artifacts in one workflow run).
- Web artifact builds for supported static web projects.
- Web-to-Android **Trusted Web Activity (TWA)** APK/AAB builds for deployed HTTPS PWAs. TWA uses the Android browser through Custom Tabs; it does **not** embed an Android WebView.
- Project Doctor, workflow setup, build history, artifacts, logs, retry, and release workflow support.
- Free plan: 5 distinct projects/repositories per calendar month. Pro: $10/month or $99/year with unlimited projects and selected Pro Android features.

## TWA requirements

A TWA is appropriate for a deployed HTTPS web app/PWA. It does not bundle the web source into the APK. The site should have a valid `manifest.json` or `manifest.webmanifest` and must serve `/.well-known/assetlinks.json` that matches the Android package ID and SHA-256 certificate fingerprint used to sign the APK/AAB. If verification is not valid, Chrome may show browser UI rather than a trusted fullscreen TWA. See the [Android TWA overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities) and [quick-start guide](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2).

For TWA release builds, add these **repository Actions secrets** in the target GitHub repository: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and `ANDROID_STORE_PASSWORD`. Use a persistent keystore. Do not use a temporary signing key for a published app because app updates must retain signing continuity. Publish the matching `assetlinks.json` file on your website.

For Flutter/Gradle repositories, select the repository and leave the default `APK + AAB • Auto Detect` target: WyBuild installs/updates the workflow and produces both artifacts in one run. For web/PWA repositories, a deployed HTTPS URL is still required for a TWA because the Android wrapper loads the live website rather than bundling the website source. The workflow checks for a valid deployed PWA manifest/icon and verifies `/.well-known/assetlinks.json`. TWA APKs are checked against the configured signing certificate; Play-ready TWA AABs also require the Play app-signing SHA-256 fingerprint because Google Play re-signs distributed APKs. Fix the website configuration if validation fails; WyBuild does not silently change your production website.

## Cost model and limits

WyBuild keeps developer utilities free and charges only for project capacity and selected Android wrapper capabilities. The Free plan includes **5 distinct GitHub repositories/projects per calendar month**. A project is counted when a build is started for a repository; rebuilding the same repository in the same month does not consume another project slot. Pro is **$10/month or $99/year** with unlimited projects and the Pro Android feature set.

Builds still run in the connected repository's GitHub Actions environment, so GitHub Actions usage and artifact/cache quotas are governed by the repository owner and their GitHub plan. WyBuild does not claim unlimited free CI compute.

Subscription state is stored server-side in Firebase/Firestore. Checkout is provider-agnostic: set `WYBUILD_PRO_MONTHLY_URL`, `WYBUILD_PRO_YEARLY_URL` (optionally containing `{USER_ID}`) and a `BILLING_WEBHOOK_SECRET`; your payment provider should call `POST /api/billing/webhook` with the signed user/plan/status payload.

## Vercel deployment and Flutter root detection

Vercel runs `bash vercel-build.sh`. The script resolves its own directory, locates the Flutter app by checking for both `pubspec.yaml` and `lib/main.dart`, and supports a Flutter app nested in common subdirectories. It reports the discovered app directory and gives an actionable error if the source files are absent. The generated web output is placed in the repository-root `build/web` directory configured in `vercel.json`.

If deployment still reports that `lib/main.dart` is missing, confirm that the file is committed to the connected GitHub branch and that Vercel is deploying the intended repository and branch. Do not create a placeholder entrypoint just to bypass the error.

## Local Flutter Web development

```bash
flutter pub get
flutter run -d chrome
flutter build web --release
```

## Firebase/Firestore security

The included `firestore.rules` denies direct client reads/writes. WyBuild uses the Firebase Admin SDK server-side for subscriptions, monthly project usage, notification tokens and short-lived cache data.

## Backend environment

See `.env.example`. Never commit secrets. WyBuild uses Firebase Admin/Firestore for server-side state and FCM, removing the former Upstash Redis requirement. GitHub OAuth remains the GitHub connection because WyBuild must call the GitHub API and Actions on the user's behalf.

## Free Developer Toolbox

The **Free Developer Tools** page is organized into collapsible menus for Encoding & Data, Hashing & Crypto, Keys & Identifiers, and Web/API Helpers. It includes Base64/Base64URL, URL encoding, JSON formatting, SHA-1/256/512, MD5, HMAC-SHA256, JWT payload decoding, UUID v4, API-key/secret generation, and Unix timestamps. Inputs stay in the browser; these tools are convenience utilities and are not a replacement for production secret management.

## Notifications

Build success/failure push notifications are implemented using Firebase Cloud Messaging (FCM), with a per-repository callback secret that WyBuild attempts to provision through GitHub Actions secrets when the connected GitHub OAuth token has permission to manage repository Actions secrets; the install response reports whether setup succeeded. To enable delivery:

1. Create a Firebase project and Web App.
2. Copy the Firebase Web App config and Web Push VAPID public key into `web/firebase-config.js` (public client config only).
3. Put the Firebase service-account JSON into Vercel as `FCM_SERVICE_ACCOUNT_JSON`. Never put the service-account private key in the web folder.
4. Ensure your GitHub OAuth app/token can create repository Actions secrets. WyBuild tries to add `WYBUILD_NOTIFY_SECRET` when installing its workflow.
5. Redeploy WyBuild, connect GitHub, install/update the workflow in a repository, then use Settings → Enable build push notifications.

FCM itself has no per-message fee for standard Firebase Cloud Messaging usage. Firebase/Firestore and GitHub still have their own quotas and terms; keep API rate limits and concurrency controls enabled.


## Play Store readiness and build preflight

WyBuild includes a repository-level Play Store Readiness Check under Projects. It inspects common Gradle/Flutter configuration for target SDK, compile SDK, version code, signing configuration, manifests, dependency lockfiles and likely secret hygiene issues. It also calls out checks that cannot be proven from source alone, such as Play Console declarations, app quality, and the live TWA Digital Asset Links relationship. It is a preflight aid, not a Play approval guarantee.

As of 31 August 2026, new Google Play app submissions and updates generally need to target Android 16 / API 36 or higher. The generated TWA template now uses compileSdk/targetSdk 36 with Android Gradle Plugin 8.9.1 and Gradle 8.11.1. Confirm current official requirements before future releases.

### Release signing

For production AABs, configure a persistent upload key in the target GitHub repository Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and `ANDROID_STORE_PASSWORD`. WyBuild blocks AAB release builds if these are missing; it does not generate a temporary AAB signing key. Keep keystores and passwords out of source control. A temporary key may be used for test APKs only. Existing signed APKs are verified and not signed a second time.

### CI failure prevention

The workflow validates the requested target, checks TWA prerequisites before Gradle runs, requires persistent signing for AABs, avoids blindly re-signing APKs, and validates artifact signatures before upload. Builds still need to be run on GitHub Actions to verify each user's own dependencies, SDK setup, credentials and project configuration.


## Error details and build diagnosis

WyBuild API failures return a stable error code, the HTTP status, any safe GitHub API detail, an actionable next step, and a short reference ID. Server-side errors are written to Vercel function logs with the same reference ID (the server does not send a stack trace to the browser). Project Doctor and dashboard repository-history failures are shown rather than silently ignored.

For a failed, timed-out, or startup-failed build, open **Builds → Diagnose failure**. WyBuild requests the GitHub Actions job metadata and log archive only when you click this button, identifies failed steps, and displays a short excerpt around compiler/Gradle/npm/SDK/signing error lines. The full log archive and the original GitHub run remain available from **Logs** and **GitHub**. Some third-party action failures or log archive formats may not map automatically to a step; in that case WyBuild says so and links to the complete logs instead of inventing a root cause.

A failed-run diagnosis is on-demand to avoid repeated GitHub API requests and extra hosting work during normal dashboard refreshes. The workflow also writes a failure summary to the GitHub Actions run summary, identifying the failed step and targeted troubleshooting area.

## Per-project native feature and gesture selections

For each selected GitHub repository, choose `Web → Android TWA APK` or `Web → Android TWA AAB`, then use **Native features & gestures** in the build area. Selections are kept separately per repository while the Projects screen remains open and are sent only with that build. Free features are available to everyone; selected Pro Android wrapper options are marked PRO in the build menu and enforced server-side.

The generated TWA adds Android manifest permissions for selected camera/microphone, location, vibration, and notification options. Selecting `DEEP_LINKS` adds an auto-verified HTTPS app-link intent filter for the configured website host. The GitHub Actions summary lists selected options and generated permissions.

A TWA is Chrome-powered, not a WebView. Therefore pull-to-refresh, custom swipe gestures, share, file picker, downloads, battery/device info, WebAuthn/passkeys and other browser capabilities still require compatible website/PWA code. WyBuild explicitly reports these as website-side requirements; selecting them does not inject a native JavaScript bridge or silently change the website. Existing Flutter/Gradle projects are built from their own source and are not modified by this TWA selector.

WyBuild now keeps internal page navigation in browser history, so Android/browser Back returns to the previous in-app page when one exists. Pulling down from the top of a scrollable page refreshes the current route, and a toolbar refresh button is also available.


## Build engine versions and environment

The generated workflow uses Bubblewrap CLI 1.25.0, Node.js 24 for web/TWA tooling, JDK 17 for Android/TWA builds, Android API 36 and Build Tools 36.0.0 for TWA, Flutter 3.47.0 for the WyBuild web build, `actions/checkout@v7`, `actions/setup-node@v7`, `actions/setup-java@v6`, `android-actions/setup-android@v4`, and `actions/upload-artifact@v7`. These are pinned in the generated workflow where applicable; verify upstream release notes before changing them. Bubblewrap documents JDK 17 for its Android build environment; Android Gradle Plugin 9.3 also uses JDK 17 and supports API 37, keeping API 36 inside that compatibility range.

Server-side variables are in `.env.example`. The browser Firebase Web App configuration in `web/firebase-config.js` is public client configuration, not a server secret. New deployments use `FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON` for Firestore/FCM server state; no Upstash Redis dependency is required.

GitHub repository Actions secrets for Play-ready releases: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`; TWA AABs additionally require `ANDROID_PLAY_APP_SIGNING_SHA256`. `WYBUILD_NOTIFY_SECRET` is generated per repository when Actions-secret permissions are available.


## Gemini build-repair agent
The AI agent is optional. Normal builds do not call Gemini. When a build fails, the agent analyzes the GitHub Actions failure and may change only `.github/workflows/wybuild.yml` when the evidence indicates a workflow/infrastructure defect. Repository/source/dependency failures are reported without AI changes. The primary model is the stable `gemini-3.5-flash-lite`; `gemini-3.8-flash` is used only as escalation. Successful WyBuild workflows are retained in a shared server-side registry for reuse.
