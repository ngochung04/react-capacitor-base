# Self-hosted OTA shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the demo FE with a minimal native shell that checks a self-hosted Capgo updater endpoint and optionally downloads the product web bundle.

**Architecture:** Builtin APK web assets are a light status screen only. `@capgo/capacitor-updater` runs in manual mode (`autoUpdate: false`). On launch the shell calls `notifyAppReady`, then `getLatest`; if a zip URL is returned, the user chooses Download or Later. Download uses `download` + `set` (reload). Product FE is hosted by the owner, not this repo.

**Tech Stack:** React 19, Vite 8, Capacitor 8, `@capgo/capacitor-updater`, GitHub Actions debug APK.

## Global Constraints

- Builtin UI: logo + checking / error+Retry / Download+Later — no marketing hero or stack cards
- Product FE is not shipped in this repo or APK
- `autoUpdate: false`; `statsUrl` and `channelUrl` empty (no Capgo cloud)
- `updateUrl` from `OTA_UPDATE_URL` (HTTPS); placeholder if unset
- Skip updater APIs unless `Capacitor.isNativePlatform()`
- Dialog is optional download, never forced
- CI still produces debug APK from shell `dist/`

---

### Task 1: Updater plugin and config

**Files:**
- Modify: `package.json`
- Modify: `capacitor.config.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `.github/workflows/android.yml`

**Interfaces:**
- Consumes: owner HTTPS update endpoint
- Produces: native `CapacitorUpdater` with `updateUrl`, manual mode, stats/channel disabled

- [ ] Install `@capgo/capacitor-updater` and sync Android
- [ ] Set CapacitorUpdater config (`autoUpdate: false`, empty stats/channel, env `updateUrl`)
- [ ] Wire `OTA_UPDATE_URL` into CI env from `secrets.OTA_UPDATE_URL`

---

### Task 2: OTA check/download helpers

**Files:**
- Create: `src/ota.ts`

**Interfaces:**
- Produces:
  - `markAppReady(): Promise<void>`
  - `checkForUpdate(): Promise<UpdateCheck>`
  - `installUpdate(update: AvailableUpdate): Promise<void>`
  - `UpdateCheck` = `{ status: 'available'; version; url; checksum? } | { status: 'none' } | { status: 'error'; message }`

- [ ] Implement `interpretLatest` + native wrappers around `getLatest` / `download` / `set`

---

### Task 3: Minimal shell UI

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `index.html` (title/theme only if needed)

- [ ] Call `markAppReady()` immediately on native before paint
- [ ] Shell states: checking, prompt, downloading, deferred, none, error, web
- [ ] Strip demo CSS; keep existing ink/accent tokens

---

### Task 4: Owner notes + verify

**Files:**
- Modify: `docs/superpowers/specs/2026-09-11-self-hosted-ota-design.md` (server/zip note)

- [ ] Document zip root (`index.html` at zip root) and POST JSON contract
- [ ] `npm run build` and `npx cap sync android`
