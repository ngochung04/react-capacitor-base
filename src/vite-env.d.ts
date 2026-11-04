/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly OTA_GITHUB_REPO?: string
  readonly VITE_LOTTERY_API?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
