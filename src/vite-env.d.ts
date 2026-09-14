/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OTA_GITHUB_REPO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
