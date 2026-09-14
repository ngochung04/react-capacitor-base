import { Capacitor } from '@capacitor/core'
import './index.css'
import {
  checkForUpdate,
  installUpdate,
  markAppReady,
} from './ota.ts'
import type { AvailableUpdate } from './ota.ts'

function requiredElement<T extends HTMLElement>(
  selector: string,
  type: new () => T,
): T {
  const el = document.querySelector(selector)
  if (!(el instanceof type)) {
    throw new Error(`Shell markup is missing: ${selector}`)
  }
  return el
}

const ui = {
  status: requiredElement('#status', HTMLElement),
  download: requiredElement('#download', HTMLButtonElement),
  later: requiredElement('#later', HTMLButtonElement),
  retry: requiredElement('#retry', HTMLButtonElement),
}

let pendingUpdate: AvailableUpdate | undefined

function setStatus(text: string) {
  ui.status.textContent = text
}

function showButtons(which: {
  download?: boolean
  later?: boolean
  retry?: boolean
}) {
  ui.download.hidden = !which.download
  ui.later.hidden = !which.later
  ui.retry.hidden = !which.retry
}

async function runCheck() {
  setStatus('Checking for updates…')
  showButtons({})
  pendingUpdate = undefined

  const result = await checkForUpdate()
  if (result.status === 'available') {
    pendingUpdate = result.update
    setStatus(`Version ${result.update.version} is ready to download.`)
    showButtons({ download: true, later: true })
    return
  }
  if (result.status === 'error') {
    setStatus(result.message)
    showButtons({ retry: true })
    return
  }
  setStatus('Waiting for the app bundle.')
  showButtons({ retry: true })
}

ui.download.addEventListener('click', () => {
  const update = pendingUpdate
  if (!update) {
    return
  }
  setStatus('Downloading…')
  showButtons({})
  void installUpdate(update).catch(() => {
    setStatus('Could not download the update')
    showButtons({ retry: true })
  })
})

ui.later.addEventListener('click', () => {
  pendingUpdate = undefined
  setStatus('Update postponed. You can check again anytime.')
  showButtons({ retry: true })
})

ui.retry.addEventListener('click', () => {
  void runCheck()
})

if (Capacitor.isNativePlatform()) {
  void markAppReady()
  void runCheck()
} else {
  setStatus('This shell loads the product on a device after an OTA update.')
  showButtons({})
}
