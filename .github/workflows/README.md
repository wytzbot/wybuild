# GitHub Actions workflows

WyBuild does not run the Android build workflow in its own repository. The Android workflow is embedded in `api/index.js` and installed into the user's selected repository by the app. Keep `api/index.js`'s `WORKFLOW` string and `.github/workflows/wybuild.yml` synchronized when editing build behavior.

TWA builds use the pinned `@bubblewrap/cli@1.25.0` flow in GitHub Actions: validate the deployed PWA manifest/icon and Digital Asset Links, generate `twa-manifest.json`, run `bubblewrap update`/`doctor`, apply the selected Android permissions/deep-link option, then run `bubblewrap build` with the repository's persistent signing key. Bubblewrap produces a normal Android project plus signed APK/AAB artifacts.

For a TWA APK, Digital Asset Links are checked against the configured release/upload certificate. For a Play-distributed TWA AAB, the workflow also requires `ANDROID_PLAY_APP_SIGNING_SHA256` and verifies the website association against the certificate Google Play uses to sign distributed APKs.

The Play Store preflight requires a persistent upload key for release AABs, targets API 36 in the generated TWA project, and verifies APK/AAB signatures before uploading artifacts. GitHub Actions usage is charged/limited according to the target repository owner's GitHub plan and allowances.
