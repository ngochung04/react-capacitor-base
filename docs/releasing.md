# Releasing

Run this from a clean checkout of the branch to release:

```sh
npm run release -- patch
```

Use `minor` or `major` instead of `patch` when appropriate; omitting the bump defaults to `patch`. The version increments from the greater of `package.json` and the highest local `vX.Y.Z` tag. The script updates `package.json`, `package-lock.json`, Android `versionName` and `versionCode`, then commits, tags as `vX.Y.Z`, and pushes the branch and tag to `origin`. Pushing the tag starts the OTA GitHub Actions workflow, which builds and publishes the OTA bundle as a GitHub Release.

Preview without changing files or pushing:

```sh
npm run release -- patch --dry-run
```

This automates the OTA release, not a signed Play Store APK. The Android workflow currently builds a debug APK.
