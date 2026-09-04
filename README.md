# WyBuild — Flutter Web

WyBuild is a Flutter Web developer build platform that connects GitHub repositories to automated GitHub Actions builds.

## What changed

The old React/Vite frontend has been consolidated into **one Flutter Web frontend** in `lib/main.dart`.

The backend remains a single Vercel Node function in `api/index.js`.

### New build-setup flow

**Projects → Project Doctor → Install/update workflow → choose target → Build**

WyBuild now also supports a **Web → Android APK** path for static Vite/React/Node/vanilla web projects:

1. Detect the web project.
2. Run its normal web build.
3. Copy the static output into a temporary Android WebView wrapper.
4. Generate the Android Gradle project in GitHub Actions.
5. Install the Gradle wrapper/toolchain.
6. Build the APK.
7. Upload the APK as the normal WyBuild artifact.

This does not require Android Studio on the developer's phone.

## Important limitation

Web → APK currently targets projects that produce a static `index.html` plus assets. Next.js server-rendered applications need a static export or an existing Android wrapper.

Release signing should be configured with GitHub Actions secrets. WyBuild does not put signing keys in the Flutter frontend.

## Local Flutter Web development

```bash
flutter pub get
flutter run -d chrome
```

## Production build

```bash
flutter build web --release
```

The Vercel configuration uses `vercel-build.sh` to install Flutter in the build environment when necessary, then publishes `build/web`.

## Backend environment

Keep the existing Vercel environment variables:

- `APP_URL`
- `SESSION_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `WYDEV_BILLING_API_URL`
- `WYDEV_BILLING_SERVICE_TOKEN`
- `WYDEV_BILLING_URL`

Never commit secrets.

## GitHub workflow

The workflow is version 19 and is embedded in `api/index.js` as well as `.github/workflows/wybuild.yml`. The backend installs it into a setup branch and attempts to create/merge a pull request into the default branch.

Supported direct Android builds:

- Flutter → APK/AAB
- Android/Gradle → APK/AAB

Supported web builds:

- Vite/React/Node → web artifact
- Vanilla HTML → web artifact
- Next.js → web package

Supported web-to-APK:

- Static Vite/React/Node output
- Vanilla HTML/static output

## Billing

WyDev remains the server-side billing authority. WyBuild enforces build limits in the backend; the Flutter frontend is never treated as proof of payment.


## Cost model
WyBuild uses GitHub Actions and the Android/Flutter toolchains already available in CI. WyBuild does not add paid Android SDK libraries or paid native plugins. GitHub Actions usage and any third-party billing plan limits still apply; the service cannot guarantee zero infrastructure cost at arbitrary scale.

## Android release signing

WyBuild signs release APK/AAB artifacts after the Android build. For production apps and Play Store updates, configure these GitHub Actions repository secrets in every target repository:

- `ANDROID_KEYSTORE_BASE64` — base64-encoded JKS/PKCS12 keystore
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_STORE_PASSWORD`

If these are absent, WyBuild generates a temporary release key so the artifact is still signed, but that key is intentionally not persistent and must not be used for production update continuity.
