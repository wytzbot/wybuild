# WyBuild — Free-beta Android build assistant

WyBuild connects GitHub repositories to repeatable GitHub Actions builds and checks common project setup issues before building.

## Current free-beta scope

- Flutter and existing Android/Gradle APK/AAB builds.
- Web artifact builds for supported static web projects.
- Web-to-Android **Trusted Web Activity (TWA)** APK/AAB builds for deployed HTTPS PWAs. TWA uses the Android browser through Custom Tabs; it does **not** embed an Android WebView.
- Project Doctor, workflow setup, build history, artifacts, logs, retry, and release workflow support.
- No WyBuild subscription or payment is required during beta. The server enforces a small monthly build allowance to reduce abuse.

## TWA requirements

A TWA is appropriate for a deployed HTTPS web app/PWA. It does not bundle the web source into the APK. The site should have a valid `manifest.json` or `manifest.webmanifest` and must serve `/.well-known/assetlinks.json` that matches the Android package ID and SHA-256 certificate fingerprint used to sign the APK/AAB. If verification is not valid, Chrome may show browser UI rather than a trusted fullscreen TWA. See the [Android TWA overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities) and [quick-start guide](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2).

For TWA release builds, add these **repository Actions secrets** in the target GitHub repository: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and `ANDROID_STORE_PASSWORD`. Use a persistent keystore. Do not use a temporary signing key for a published app because app updates must retain signing continuity. Publish the matching `assetlinks.json` file on your website.

In WyBuild Projects, select `Web → Android TWA APK` or `Web → Android TWA AAB`, enter the deployed HTTPS URL, Android package ID and display name, then build. The workflow checks for a root `manifest.json` or `manifest.webmanifest`, reads the configured persistent signing certificate, and verifies that `/.well-known/assetlinks.json` contains the matching package ID, SHA-256 fingerprint and `delegate_permission/common.handle_all_urls` relationship. Fix the website configuration if validation fails; WyBuild does not silently change your production website.

## Cost model and limits

WyBuild does not run customer builds on WyBuild-hosted build servers. Builds run in the connected repository's GitHub Actions environment, so GitHub Actions usage and artifact/cache quotas are governed by the repository owner and their GitHub plan. Public repositories using standard GitHub-hosted runners generally have different allowances than private repositories. WyBuild's own hosting, KV/database, and outbound usage can still have provider limits or charges at scale; no public hosted service can promise zero cost at arbitrary usage. Keep build limits, artifact retention and API request caps enabled.

## Local Flutter Web development

```bash
flutter pub get
flutter run -d chrome
flutter build web --release
```

## Backend environment

See `.env.example`. Never commit secrets. `WYDEV_BILLING_*` values are no longer required during free beta; billing is intentionally disabled in the API.

## Notifications

Build success/failure push notifications are implemented using Firebase Cloud Messaging (FCM), with a per-repository callback secret that WyBuild attempts to provision through GitHub Actions secrets when the connected GitHub OAuth token has permission to manage repository Actions secrets; the install response reports whether setup succeeded. To enable delivery:

1. Create a Firebase project and Web App.
2. Copy the Firebase Web App config and Web Push VAPID public key into `web/firebase-config.js` (public client config only).
3. Put the Firebase service-account JSON into Vercel as `FCM_SERVICE_ACCOUNT_JSON`. Never put the service-account private key in the web folder.
4. Ensure your GitHub OAuth app/token can create repository Actions secrets. WyBuild tries to add `WYBUILD_NOTIFY_SECRET` when installing its workflow.
5. Redeploy WyBuild, connect GitHub, install/update the workflow in a repository, then use Settings → Enable build push notifications.

FCM itself has no per-message fee for standard Firebase Cloud Messaging usage, but WyBuild still uses its existing hosting and KV provider. Keep the beta build cap enabled to limit abuse and provider usage.


## Play Store readiness and build preflight

WyBuild includes a repository-level Play Store Readiness Check under Projects. It inspects common Gradle/Flutter configuration for target SDK, compile SDK, version code, signing configuration, manifests, dependency lockfiles and likely secret hygiene issues. It also calls out checks that cannot be proven from source alone, such as Play Console declarations, app quality, and the live TWA Digital Asset Links relationship. It is a preflight aid, not a Play approval guarantee.

As of 31 August 2026, new Google Play app submissions and updates generally need to target Android 16 / API 36 or higher. The generated TWA template now uses compileSdk/targetSdk 36 with Android Gradle Plugin 8.9.1 and Gradle 8.11.1. Confirm current official requirements before future releases.

### Release signing

For production AABs, configure a persistent upload key in the target GitHub repository Actions secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, and `ANDROID_STORE_PASSWORD`. WyBuild blocks AAB release builds if these are missing; it does not generate a temporary AAB signing key. Keep keystores and passwords out of source control. A temporary key may be used for test APKs only. Existing signed APKs are verified and not signed a second time.

### CI failure prevention

The workflow validates the requested target, checks TWA prerequisites before Gradle runs, requires persistent signing for AABs, avoids blindly re-signing APKs, and validates artifact signatures before upload. Builds still need to be run on GitHub Actions to verify each user's own dependencies, SDK setup, credentials and project configuration.
