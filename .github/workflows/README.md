# GitHub Actions workflows

WyBuild does not run the Android build workflow in its own repository. The Android workflow is embedded in `api/index.js` and installed into the user's selected repository by the app. Keep `api/index.js`'s `WORKFLOW` string and `.github/workflows/wybuild.yml` synchronized when editing build behavior.

The Play Store preflight requires a persistent upload key for release AABs, targets API 36 in the generated TWA template, and verifies APK/AAB signatures before uploading artifacts. GitHub Actions usage is charged/limited according to the target repository owner's GitHub plan and allowances.
