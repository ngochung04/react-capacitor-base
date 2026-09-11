# Self-hosted OTA updates (Capacitor)

Date: 2026-09-11  
Status: approved for planning (revised)

## Goal

Ship a **lightweight Android shell** that checks a **self-hosted HTTPS OTA endpoint** and optionally downloads the real web app bundle. The product FE (heavy) is **not** baked into the APK; it is delivered over the air from the owner's server.

Stack: `@capgo/capacitor-updater`, manual update mode, owner-provided URL.

## Non-goals

- Capgo cloud / Ionic Appflow hosting
- Automatic upload from CI to the owner's server (unless credentials are added later)
- iOS
- Play Store signed release pipeline
- Encrypted bundles (can be added later)
- Forced updates with no dismiss option
- Shipping the full product FE inside this repo / APK

## Current state

- Starter ships a demo marketing screen in `src/` and bakes it into the APK via `cap sync`.
- GitHub Actions on `main` builds a debug APK artifact.
- No updater plugin is installed.

## Architecture

```
This repo (shell)              Owner server                    Android app
─────────────────              ────────────                    ───────────
Minimal FE → dist/             HTTPS update endpoint
APK = shell only               HTTPS zip = product FE
CI: debug APK (+ optional      ←─────────────────────────────  open → shell UI
    shell zip for tests)                                        check update
                                                                Download / Later
                                                                download → set → reload
                                                                → product FE runs
```

- **Builtin bundle** = lightest shell only (logo + update status + Retry).
- **OTA bundle** = product web app (`dist/` of the real FE), zip with `index.html` at zip root — built and hosted by the owner (separate from this shell repo, or a future product package).
- Native/plugin/permission changes still require a new APK.
- OTA replaces only the web layer.

## Approach

Use `@capgo/capacitor-updater` with `autoUpdate: "off"` (manual) so the user can accept or defer download.

### Builtin shell UI (choice A)

While on the builtin bundle (first install, declined update, or offline):

- Minimal screen: brand/logo mark
- Status: “Checking for updates…” while the check runs
- On failure / no usable update yet: message + **Retry**
- When an update is available: dialog **Download** / **Later** (same as before)
- No marketing hero, stack cards, or heavy assets in `src/`

### Server contract (owner-provided)

- **Update URL**: HTTPS endpoint (`updateUrl` or runtime equivalent).
- Plugin **POST**s app/device metadata (platform, app_id, version_name, version_build, device_id, plugin_version, etc.).
- When an update is available:

```json
{
  "version": "1.0.1",
  "url": "https://example.com/updates/1.0.1.zip",
  "checksum": "sha256_of_zip"
}
```

- When no update / error:

```json
{
  "message": "No update available",
  "version": "",
  "url": ""
}
```

- Zip over HTTPS; version is semver; server compares to client `version_name`.
- Product zip contents are the owner's FE build, not necessarily this repo's `dist/`.

### App behavior (UX)

On native app open (shell or after reload into OTA bundle):

1. Call `CapacitorUpdater.notifyAppReady()` early (required to avoid rollback).
2. On **builtin shell**: show “Checking for updates…”, then `getLatest` (or equivalent).
3. Update available → dialog **Download** / **Later**.
4. **Download** → download → set → `reload` into product FE.
5. **Later** → stay on shell; next launch prompts again if still outdated.
6. Check/network failure on shell → show error + **Retry** (do not pretend the product app is ready).
7. After OTA product bundle is active: product FE must also call `notifyAppReady()` on launch; optional re-check for newer OTA can follow the same Download/Later pattern.
8. Skip native-only OTA UI quirks when not on a native platform; web/`npm run dev` runs the shell for local work.

### Repo changes

| Area | Change |
|------|--------|
| `src/` | Replace starter demo with minimal shell UI + OTA flow |
| Dependencies | Add `@capgo/capacitor-updater`; sync Android |
| `capacitor.config.ts` | `autoUpdate: "off"`; `updateUrl` placeholder/env until owner URL is set |
| Assets | Keep shell CSS/mark tiny; no heavy images or demo sections |
| CI | Build debug APK from shell `dist/`; optional zip of shell for testing only — **product OTA zip is owner's responsibility** |
| Docs | This spec; short note on zip layout and endpoint |

### Error handling and safety

- Invalid checksum / corrupt zip: do not set bundle; stay on current (shell or previous OTA); allow Retry.
- Failed apply: remain on previous/builtin.
- Rollback: new bundle must call `notifyAppReady()` in time or Capgo rolls back (typically back to shell).

## Success criteria

- APK size/source stays minimal: shell-only FE in this repo.
- First open shows logo + checking / Retry, not a full product UI.
- Accepting OTA loads the owner's product bundle after reload.
- Declining or failing leaves the shell and can retry / prompt next launch.
- CI still produces a debug APK from the shell.

## Open input from owner

- Final HTTPS `updateUrl`.
- Product FE build/publish pipeline that produces the OTA zip + checksum.
- Semver scheme for OTA versions.

## Implementation next step

Write an implementation plan, then: slim `src/` to shell UI, install updater, wire check/dialog/download/reload, configure `updateUrl`, adjust CI for shell APK.
