# Self-hosted OTA updates (Capacitor)

Date: 2026-09-11  
Status: approved for planning

## Goal

Enable over-the-air updates of the web layer (`dist/`) for the Android Capacitor app, using `@capgo/capacitor-updater` against a **self-hosted HTTPS endpoint** provided by the app owner. Users choose whether to download when an update is available.

## Non-goals

- Capgo cloud / Ionic Appflow hosting
- Automatic upload from CI to the owner's server (unless credentials are added later)
- iOS
- Play Store signed release pipeline
- Encrypted bundles (can be added later)
- Forced updates with no dismiss option

## Current state

- Web assets are baked into the APK via `cap sync` (`android/app/src/main/assets/public/`).
- GitHub Actions on `main` builds a debug APK and uploads it as an artifact.
- No updater plugin is installed.

## Architecture

```
GitHub Actions                 Owner server                    Android app
──────────────                 ────────────                    ───────────
npm run build → dist/          HTTPS update endpoint
zip dist/ as OTA artifact      HTTPS zip hosting
assembleDebug APK              ←─────────────────────────────  on launch: check
                                                                dialog: Download / Later
                                                                if Download: download → set → reload
```

- The APK always ships a **builtin** web bundle as fallback.
- OTA replaces only the web layer. Native/plugin/permission changes still require a new APK.
- Bundle content = Vite `dist/` output, packaged as a zip with `index.html` at the zip root.

## Approach

Use `@capgo/capacitor-updater` in **manual** mode (`autoUpdate: "off"`) so the app can prompt the user before downloading.

### Server contract (owner-provided)

- **Update URL**: HTTPS endpoint configured in the app (`updateUrl` or runtime equivalent).
- Plugin sends a **POST** with app/device metadata (platform, app_id, version_name, version_build, device_id, plugin_version, etc.).
- When an update is available, respond with JSON:

```json
{
  "version": "1.0.1",
  "url": "https://example.com/updates/1.0.1.zip",
  "checksum": "sha256_of_zip"
}
```

- When no update (or error), respond with a `message` (and no usable download URL), for example:

```json
{
  "message": "No update available",
  "version": "",
  "url": ""
}
```

- Zip must be served over HTTPS. Version must be semver. Server compares against the client's `version_name`.

### App behavior (UX)

On native app open:

1. Call `CapacitorUpdater.notifyAppReady()` early (required; missing call within the plugin timeout triggers rollback).
2. Check for updates via the configured endpoint (`getLatest` / equivalent).
3. If a newer version exists, show a dialog: **Download** / **Later**.
4. **Download**: download bundle → set as next → `reload` (restart into new web build).
5. **Later**: do nothing; on the next launch, show the prompt again if an update is still available.
6. Network/check failures: fail silently and keep the current bundle (do not block app start).
7. Skip the entire OTA flow when not on a native platform (`npm run dev` / browser).

### Repo changes

| Area | Change |
|------|--------|
| Dependencies | Add `@capgo/capacitor-updater`; sync Android |
| `capacitor.config.ts` | `plugins.CapacitorUpdater.autoUpdate = "off"`; set `updateUrl` from owner URL (placeholder/env until provided) |
| `src/` | Small OTA module + dialog wiring on startup; `notifyAppReady` on every successful launch |
| CI | Keep debug APK artifact; add zip of `dist/` as an OTA artifact for manual (or later automated) upload |
| Docs | This spec; brief server/zip notes for the owner |

### Error handling and safety

- Invalid checksum / corrupt zip: do not set the bundle; keep current.
- Failed apply: user remains on previous/builtin bundle.
- Rollback: if the new bundle does not call `notifyAppReady()` in time, Capgo rolls back automatically.

## Success criteria

- Native app checks the owner URL on open and prompts when an update exists.
- Accepting download installs the new web bundle and reloads into it.
- Declining leaves the current bundle and prompts again on a later launch if still outdated.
- Web-only development is unchanged.
- CI still produces a debug APK and also an OTA zip of `dist/`.

## Open input from owner

- Final HTTPS `updateUrl` (and zip base URL strategy).
- How versions are assigned (recommend semver aligned with release process).

## Implementation next step

Write an implementation plan from this spec, then implement plugin install, config, OTA UI flow, and CI zip artifact.
