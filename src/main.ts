import { Capacitor } from '@capacitor/core'
import './index.css'
import {
  checkForUpdate,
  currentBundleLabel,
  installUpdate,
  markAppReady,
} from './ota.ts'
import type { AvailableUpdate } from './ota.ts'

const NOTE_KEY = 'starter-note'
const TALLY_KEY = 'starter-tally'

function requiredElement<T extends HTMLElement>(
  selector: string,
  type: new () => T,
): T {
  const el = document.querySelector(selector)
  if (!(el instanceof type)) {
    throw new Error(`Missing element: ${selector}`)
  }
  return el
}

const ui = {
  updateBar: requiredElement('#update-bar', HTMLElement),
  updateText: requiredElement('#update-text', HTMLElement),
  download: requiredElement('#download', HTMLButtonElement),
  later: requiredElement('#later', HTMLButtonElement),
  checkUpdate: requiredElement('#check-update', HTMLButtonElement),
  build: requiredElement('#build', HTMLElement),
  note: requiredElement('#note', HTMLTextAreaElement),
  noteMeta: requiredElement('#note-meta', HTMLElement),
  tally: requiredElement('#tally', HTMLElement),
  tallyUp: requiredElement('#tally-up', HTMLButtonElement),
  tallyDown: requiredElement('#tally-down', HTMLButtonElement),
  tallyReset: requiredElement('#tally-reset', HTMLButtonElement),
  toast: requiredElement('#toast', HTMLElement),
}

let pendingUpdate: AvailableUpdate | undefined
let saveTimer = 0
let toastTimer = 0

function showToast(text: string) {
  ui.toast.textContent = text
  ui.toast.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    ui.toast.hidden = true
  }, 2200)
}

function hideUpdateBar() {
  ui.updateBar.hidden = true
  pendingUpdate = undefined
}

function setTally(value: number) {
  const next = Math.max(0, value)
  ui.tally.textContent = String(next)
  localStorage.setItem(TALLY_KEY, String(next))
}

function currentTally(): number {
  const stored = Number(localStorage.getItem(TALLY_KEY) ?? '0')
  return Number.isFinite(stored) ? stored : 0
}

function loadNote() {
  const stored = localStorage.getItem(NOTE_KEY) ?? ''
  ui.note.value = stored
  ui.noteMeta.textContent = stored ? 'Đã lưu trên máy' : 'Chưa lưu'
}

function persistNote() {
  localStorage.setItem(NOTE_KEY, ui.note.value)
  ui.noteMeta.textContent = ui.note.value.trim()
    ? `Đã lưu · ${ui.note.value.length}/500`
    : 'Chưa lưu'
}

async function refreshBuildLabel() {
  ui.build.textContent = `Bản: ${await currentBundleLabel()}`
}

async function runCheck(showIdleToast: boolean) {
  hideUpdateBar()
  await refreshBuildLabel()

  if (!Capacitor.isNativePlatform()) {
    if (showIdleToast) {
      showToast('OTA chỉ chạy trên app Android')
    }
    return
  }

  const result = await checkForUpdate()
  if (result.status === 'available') {
    pendingUpdate = result.update
    ui.updateText.textContent = `Có bản ${result.update.version}. Tải về để dùng ngay.`
    ui.updateBar.hidden = false
    return
  }
  if (result.status === 'error') {
    showToast(result.message)
    return
  }
  if (showIdleToast) {
    showToast('Bạn đang dùng bản mới nhất')
  }
}

ui.note.addEventListener('input', () => {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(persistNote, 200)
})

ui.tallyUp.addEventListener('click', () => {
  setTally(currentTally() + 1)
})

ui.tallyDown.addEventListener('click', () => {
  setTally(currentTally() - 1)
})

ui.tallyReset.addEventListener('click', () => {
  setTally(0)
})

ui.download.addEventListener('click', () => {
  const update = pendingUpdate
  if (!update) {
    return
  }
  ui.updateText.textContent = 'Đang tải về…'
  void installUpdate(update).catch(() => {
    showToast('Không tải được bản cập nhật')
    hideUpdateBar()
  })
})

ui.later.addEventListener('click', () => {
  hideUpdateBar()
  showToast('Sẽ hỏi lại lần mở sau')
})

ui.checkUpdate.addEventListener('click', () => {
  void runCheck(true)
})

loadNote()
setTally(currentTally())

if (Capacitor.isNativePlatform()) {
  void markAppReady()
  void runCheck(false)
} else {
  void refreshBuildLabel()
}
