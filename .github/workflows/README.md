# GitHub Actions workflows

WyBuild does not run the Android build workflow in its own repository. The Android
workflow is embedded in `api/index.js` and is installed into the user's selected
repository by the app.

This prevents accidentally running an Android build against the WyBuild web app
repository itself.
