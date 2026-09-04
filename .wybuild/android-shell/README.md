# WyBuild maintained Android shell

This is the versioned native shell used for Web-to-APK/AAB builds. The build workflow copies this project and injects the compiled web output into `app/src/main/assets/www`. It must remain the single source of truth for the native wrapper.
