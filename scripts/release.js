import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const bump = args.filter((arg) => arg !== '--dry-run')[0] ?? 'patch'

if (args.filter((arg) => arg !== '--dry-run').length > 1 || !['patch', 'minor', 'major'].includes(bump)) {
  throw new Error('Usage: npm run release -- [patch|minor|major] [--dry-run]')
}

const git = (gitArgs, options = {}) => {
  const result = execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', ...options })
  return typeof result === 'string' ? result.trim() : ''
}

const packagePath = `${root}package.json`
const lockPath = `${root}package-lock.json`
const gradlePath = `${root}android/app/build.gradle`
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
const lockJson = JSON.parse(readFileSync(lockPath, 'utf8'))
const current = packageJson.version
const parseVersion = (version) => {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}
const compareVersions = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}
const versionParts = parseVersion(current)

if (!versionParts) {
  throw new Error(`package.json version must be numeric SemVer (x.y.z), received "${current}"`)
}
if (lockJson.version !== current || lockJson.packages?.['']?.version !== current) {
  throw new Error('package-lock.json version does not match package.json')
}

const latestTagParts = git(['tag', '--list'])
  .split('\n')
  .map((existingTag) => existingTag.startsWith('v') ? parseVersion(existingTag.slice(1)) : null)
  .filter(Boolean)
  .reduce(
    (latest, candidate) => (compareVersions(candidate, latest) > 0 ? candidate : latest),
    versionParts,
  )
const [major, minor, patch] = latestTagParts
const nextVersion =
  bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`
const tag = `v${nextVersion}`
const gradle = readFileSync(gradlePath, 'utf8')
const replaceOne = (text, pattern, replacement, label) => {
  const matches = [...text.matchAll(pattern)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${label} in android/app/build.gradle`)
  }
  return text.replace(pattern, replacement)
}

const versionCodeMatch = [...gradle.matchAll(/^([ \t]*)versionCode[ \t]+(\d+)[ \t]*$/gm)]
if (versionCodeMatch.length !== 1) {
  throw new Error('Expected exactly one versionCode in android/app/build.gradle')
}
const nextVersionCode = Number(versionCodeMatch[0][2]) + 1
if (!Number.isSafeInteger(nextVersionCode) || nextVersionCode > 2_100_000_000) {
  throw new Error('Android versionCode exceeds the Google Play maximum')
}
const updatedGradle = replaceOne(
  gradle,
  /^([ \t]*)versionCode[ \t]+\d+[ \t]*$/gm,
  `$1versionCode ${nextVersionCode}`,
  'versionCode',
)
const finalGradle = replaceOne(
  updatedGradle,
  /^([ \t]*)versionName[ \t]+"[^"]*"[ \t]*$/gm,
  `$1versionName "${nextVersion}"`,
  'versionName',
)

if (git(['tag', '--list', tag])) {
  throw new Error(`Tag ${tag} already exists locally`)
}
const branch = git(['branch', '--show-current'])
if (!branch) {
  throw new Error('Cannot release from a detached HEAD')
}
git(['remote', 'get-url', 'origin'])

if (dryRun) {
  console.log(`Would release ${tag} (Android versionCode ${nextVersionCode}) from ${branch}`)
  process.exit(0)
}

if (git(['status', '--porcelain', '--untracked-files=normal'])) {
  throw new Error('Working tree is not clean; commit or stash changes before releasing')
}

packageJson.version = nextVersion
lockJson.version = nextVersion
lockJson.packages[''].version = nextVersion
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
writeFileSync(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`)
writeFileSync(gradlePath, finalGradle)

git(['add', 'package.json', 'package-lock.json', 'android/app/build.gradle'])
git(['commit', '-m', `chore(release): ${tag}`], { stdio: 'inherit' })
git(['tag', '-a', tag, '-m', `Release ${tag}`], { stdio: 'inherit' })
git(['push', 'origin', `HEAD:refs/heads/${branch}`, `refs/tags/${tag}`], { stdio: 'inherit' })

console.log(`Released ${tag}; GitHub Actions will publish the OTA release.`)
