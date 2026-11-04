import { Capacitor } from '@capacitor/core'
import './index.css'
import {
  checkForUpdate,
  currentBundleLabel,
  installUpdate,
  markAppReady,
  queueUpdate,
  reloadApp,
} from './ota.ts'
import type { AvailableUpdate } from './ota.ts'
import { fetchDay, fetchRecent } from './lottery.ts'
import type { Day } from './lottery.ts'

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
  tabs: requiredElement('#day-tabs', HTMLElement),
  pickDate: requiredElement('#pick-date', HTMLFormElement),
  dateInput: requiredElement('#date-input', HTMLInputElement),
  dayLabel: requiredElement('#day-label', HTMLElement),
  board: requiredElement('#board', HTMLElement),
  error: requiredElement('#error', HTMLElement),
  toast: requiredElement('#toast', HTMLElement),
}

const ROW_LABELS: [key: string, label: string][] = [
  ['g8', 'Giải tám'],
  ['g7', 'Giải bảy'],
  ['g6', 'Giải sáu'],
  ['g5', 'Giải năm'],
  ['g4', 'Giải tư'],
  ['g3', 'Giải ba'],
  ['g2', 'Giải nhì'],
  ['g1', 'Giải nhất'],
  ['db', 'Giải ĐB'],
]

let recent: Day[] = []
let current: Day | undefined
let loading = false
let pendingUpdate: AvailableUpdate | undefined
let stagedUpdate: AvailableUpdate | undefined
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

// d/m/yyyy -> yyyy-mm-dd for <input type="date">
function toIso(display: string): string | undefined {
  const found = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(display.trim())
  if (!found) {
    return undefined
  }
  const [, d, m, y] = found
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function renderTabs() {
  ui.tabs.replaceChildren()
  const active = current ? toIso(current.date) : undefined

  for (const day of recent) {
    const iso = toIso(day.date)
    const button = document.createElement('button')
    button.type = 'button'
    button.className = iso === active ? 'chip is-on' : 'chip'
    button.textContent = day.date
    button.setAttribute('aria-selected', String(iso === active))
    button.addEventListener('click', () => {
      current = day
      renderTabs()
      renderBoard()
      if (iso) {
        ui.dateInput.value = iso
      }
    })
    ui.tabs.append(button)
  }
}

function renderBoard() {
  const day = current
  ui.board.replaceChildren()
  if (!day) {
    ui.dayLabel.textContent = ''
    return
  }

  ui.dayLabel.textContent = `${day.weekday}, ${day.date}`

  const table = document.createElement('table')
  table.className = 'kq'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  const corner = document.createElement('th')
  corner.className = 'corner'
  corner.scope = 'col'
  headRow.append(corner)
  for (const province of day.provinces) {
    const th = document.createElement('th')
    th.scope = 'col'
    const name = document.createElement('span')
    name.className = 'p-name'
    name.textContent = province.name
    const code = document.createElement('span')
    code.className = 'p-code'
    code.textContent = province.code
    th.append(name, code)
    headRow.append(th)
  }
  thead.append(headRow)

  const tbody = document.createElement('tbody')
  for (const [key, label] of ROW_LABELS) {
    if (!day.provinces.some((p) => p.prizes[key]?.length)) {
      continue
    }
    const tr = document.createElement('tr')
    if (key === 'db') {
      tr.className = 'is-special'
    } else if (key === 'g8') {
      tr.className = 'is-top'
    }
    const th = document.createElement('th')
    th.scope = 'row'
    th.textContent = label
    tr.append(th)
    for (const province of day.provinces) {
      const td = document.createElement('td')
      for (const number of province.prizes[key] ?? []) {
        const line = document.createElement('span')
        line.className = 'num'
        line.textContent = number
        td.append(line)
      }
      tr.append(td)
    }
    tbody.append(tr)
  }

  table.append(thead, tbody)
  ui.board.append(table)
}

async function showDay(iso: string) {
  ui.error.hidden = true
  ui.dayLabel.textContent = 'Đang tải…'
  try {
    const day = await fetchDay(iso)
    current = day
    ui.dateInput.value = iso
    renderTabs()
    renderBoard()
  } catch (error) {
    current = undefined
    renderBoard()
    ui.error.textContent =
      error instanceof Error ? error.message : 'Không tải được kết quả'
    ui.error.hidden = false
  }
}

async function loadRecent() {
  if (loading) {
    return
  }
  loading = true
  ui.error.hidden = true
  try {
    recent = await fetchRecent()
    current = recent[0]
    if (current) {
      const iso = toIso(current.date)
      if (iso) {
        ui.dateInput.value = iso
      }
    }
    renderTabs()
    renderBoard()
  } catch (error) {
    ui.error.textContent =
      error instanceof Error ? error.message : 'Không tải được kết quả'
    ui.error.hidden = false
  } finally {
    loading = false
  }
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
    ui.updateText.textContent = `Có bản ${result.update.version}.`
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

ui.pickDate.addEventListener('submit', (event) => {
  event.preventDefault()
  const iso = ui.dateInput.value
  if (iso) {
    void showDay(iso)
  }
})

// past days are permanent in KV; today may not have drawn yet
ui.dateInput.max = todayIso()

ui.download.addEventListener('click', () => {
  const update = pendingUpdate
  if (!update) {
    return
  }
  if (stagedUpdate === update) {
    void reloadApp()
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

// silent auto-check: on launch, when the app comes back to the foreground, and hourly.
// The bundle is only queued, so it swaps in on the next cold start instead of reloading
// under the user's finger. The manual "Cập nhật" button still reports what it found.
const AUTO_CHECK_MS = 60 * 60 * 1000
let autoCheckTimer = 0

async function autoCheck() {
  if (!Capacitor.isNativePlatform() || loading) {
    return
  }
  const result = await checkForUpdate()
  if (result.status !== 'available' || pendingUpdate) {
    return
  }
  try {
    await queueUpdate(result.update)
    pendingUpdate = result.update
    stagedUpdate = result.update
    ui.build.textContent = `Bản: ${result.update.version} (sẵn sàng)`
    showToast('Đã tải bản mới, mở lại app để dùng')
    ui.updateText.textContent = `Bản ${result.update.version} đã sẵn sàng.`
    ui.updateBar.hidden = false
  } catch {
    // a failed background download must stay silent - the next check retries
  }
}

function startAutoCheck() {
  void autoCheck()
  window.clearInterval(autoCheckTimer)
  autoCheckTimer = window.setInterval(() => {
    void autoCheck()
  }, AUTO_CHECK_MS)
}

void loadRecent()

if (Capacitor.isNativePlatform()) {
  void markAppReady()
  startAutoCheck()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void refreshBuildLabel()
      void autoCheck()
    }
  })
} else {
  void refreshBuildLabel()
}
