import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

export type AvailableUpdate = {
  version: string
  url: string
  checksum?: string
}

export type UpdateCheck =
  | { status: 'available'; update: AvailableUpdate }
  | { status: 'none' }
  | { status: 'error'; message: string }

export type GithubReleaseAsset = {
  name: string
  browser_download_url: string
}

export type GithubRelease = {
  tag_name: string
  assets: GithubReleaseAsset[]
}

export const OTA_ASSET_NAME = 'ota-bundle.zip'

export function githubRepo(): string {
  return (
    import.meta.env.OTA_GITHUB_REPO?.trim() ||
    'ngochung04/react-capacitor-base'
  )
}

export function versionFromTag(tagName: string): string {
  return tagName.trim().replace(/^v/i, '')
}

export function isNewerVersion(candidate: string, current: string): boolean {
  if (!current || current === 'builtin') {
    return true
  }

  const next = parseSemver(candidate)
  const prev = parseSemver(current)
  if (!next) {
    return false
  }
  if (!prev) {
    return true
  }

  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== prev[index]) {
      return next[index] > prev[index]
    }
  }

  return false
}

export function interpretGithubRelease(
  release: GithubRelease,
  currentVersion: string,
  assetName = OTA_ASSET_NAME,
): UpdateCheck {
  const tagName = release.tag_name?.trim()
  const asset = release.assets.find((item) => item.name === assetName)
  const version = tagName ? versionFromTag(tagName) : ''
  const url = asset?.browser_download_url?.trim()

  if (!tagName || !version || !url) {
    return {
      status: 'error',
      message: 'Latest GitHub release has no OTA bundle',
    }
  }

  if (!isNewerVersion(version, currentVersion)) {
    return { status: 'none' }
  }

  return {
    status: 'available',
    update: { version, url },
  }
}

export async function markAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return
  }

  await CapacitorUpdater.notifyAppReady()
}

export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!Capacitor.isNativePlatform()) {
    return { status: 'none' }
  }

  const repo = githubRepo()
  if (!repo) {
    return {
      status: 'error',
      message: 'GitHub repo is not configured',
    }
  }

  try {
    const [release, current] = await Promise.all([
      fetchLatestGithubRelease(repo),
      CapacitorUpdater.current(),
    ])
    return interpretGithubRelease(release, current.bundle.version)
  } catch (error) {
    if (error instanceof Error && error.message === 'No GitHub release found') {
      return {
        status: 'error',
        message: 'No GitHub release found yet',
      }
    }
    return {
      status: 'error',
      message: 'Could not check for updates',
    }
  }
}

// Silent auto-update: check, download, apply. Never throws - the caller is a timer.
//    immediate: on launch, `set` and reload straight away; the app boots on the new bundle.
//    queued:    mid-session, `next` so it swaps in on the next background/cold start
//               instead of yanking the screen away while someone is reading numbers.
export async function syncUpdate(
  immediate: boolean,
): Promise<string | undefined> {
  if (!Capacitor.isNativePlatform()) {
    return undefined
  }

  try {
    const result = await checkForUpdate()
    if (result.status !== 'available') {
      return undefined
    }
    const bundle = await CapacitorUpdater.download({
      url: result.update.url,
      version: result.update.version,
      checksum: result.update.checksum,
    })
    if (immediate) {
      // destroys the JS context and relaunches - nothing after this runs
      await CapacitorUpdater.set({ id: bundle.id })
    } else {
      await CapacitorUpdater.next({ id: bundle.id })
    }
    return result.update.version
  } catch {
    return undefined
  }
}

async function fetchLatestGithubRelease(repo: string): Promise<GithubRelease> {
  const response = await fetch(
    `https://api.github.com/repos/${repo}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'starter-app-ota',
      },
    },
  )

  if (response.status === 404) {
    throw new Error('No GitHub release found')
  }

  if (!response.ok) {
    throw new Error('GitHub release lookup failed')
  }

  const payload = (await response.json()) as GithubRelease
  if (!payload.tag_name || !Array.isArray(payload.assets)) {
    throw new Error('Invalid GitHub release payload')
  }

  return payload
}

function parseSemver(version: string): [number, number, number] | undefined {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) {
    return undefined
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
