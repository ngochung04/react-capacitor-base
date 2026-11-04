import { Capacitor } from '@capacitor/core'
import './index.css'
import {
  checkForUpdate,
  currentBundleLabel,
  installUpdate,
  markAppReady,
} from './ota.ts'
import type { AvailableUpdate } from './ota.ts'
import { fetchDays } from './lottery.ts'
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
  refresh: requiredElement('#refresh', HTMLButtonElement),
  tabs: requiredElement('#day-tabs', HTMLElement),
  board: requiredElement('#board', HTMLElement),
  dayLabel: requiredElement('#day-label', HTMLElement),
  error: requiredElement('#error', HTMLElement),
  toast: requiredElement('#toast', HTMLElement),
}

// the draw always has these prizes; XSMN has no g8 label differences worth handling
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

let days: Day[] = []
let selected = 0
let loading = false
let pendingUpdate: AvailableUpdate | undefined
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

function renderTabs() {
  ui.tabs.replaceChildren()
  days.forEach((day, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = index === selected ? 'chip is-on' : 'chip'
    button.textContent = day.date
    button.setAttribute('aria-selected', String(index === selected))
    button.addEventListener('click', () => {
      selected = index
      renderTabs()
      renderBoard()
    })
    ui.tabs.append(button)
  })
}

function renderBoard() {
  const day = days[selected]
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
    // skip a prize nobody drew, instead of leaving a blank row
    if (!day.provinces.some((p) => p.prizes[key]?.length)) {
      continue
    }
    const tr = document.createElement('tr')
    if (key === 'db') {
      tr.className = 'is-special'
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

async function load(showSpinner: boolean) {
  if (loading) {
    return
  }
  loading = true
  ui.error.hidden = true
  if (showSpinner) {
    ui.refresh.disabled = true
    ui.refresh.textContent = 'Đang tải…'
  }

  try {
    const next = await fetchDays()
    days = next
    selected = 0
    renderTabs()
    renderBoard()
  } catch (error) {
    ui.error.textContent =
      error instanceof Error ? error.message : 'Không tải được kết quả'
    ui.error.hidden = false
  } finally {
    loading = false
    ui.refresh.disabled = false
    ui.refresh.textContent = 'Tải lại'
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

ui.refresh.addEventListener('click', () => {
  void load(true)
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

void load(true)

if (Capacitor.isNativePlatform()) {
  void markAppReady()
  void runCheck(false)
} else {
  void refreshBuildLabel()
}
