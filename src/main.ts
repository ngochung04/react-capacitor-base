import { Capacitor } from '@capacitor/core'
import './index.css'
import { markAppReady, syncUpdate } from './ota.ts'
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
let toastTimer = 0

function showToast(text: string) {
  ui.toast.textContent = text
  ui.toast.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    ui.toast.hidden = true
  }, 2200)
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

function renderLoading() {
  ui.board.replaceChildren()
  const wrap = document.createElement('div')
  wrap.className = 'board-loading'
  const spinner = document.createElement('div')
  spinner.className = 'spinner'
  const text = document.createElement('span')
  text.textContent = 'Đang tải kết quả…'
  wrap.append(spinner, text)
  ui.board.append(wrap)
}

const WD_MAP: Record<string, string> = {
  hai: 'T2',
  ba: 'T3',
  tư: 'T4',
  năm: 'T5',
  sáu: 'T6',
  bảy: 'T7',
}

function shortWeekday(raw: string): string {
  const normalized = raw.toLowerCase().trim()
  if (normalized.includes('chủ nhật')) {
    return 'CN'
  }
  for (const [key, val] of Object.entries(WD_MAP)) {
    if (normalized.includes(key)) {
      return val
    }
  }
  return raw
}

function renderTabs() {
  ui.tabs.replaceChildren()
  const active = current ? toIso(current.date) : undefined
  const today = todayIso()

  for (const day of recent) {
    const iso = toIso(day.date)
    const isToday = iso === today
    const button = document.createElement('button')
    button.type = 'button'
    button.className = iso === active ? 'chip is-on' : 'chip'
    button.setAttribute('aria-selected', String(iso === active))

    const shortWd = shortWeekday(day.weekday)
    const shortDate = iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : day.date.slice(0, 5)

    const sub = document.createElement('span')
    sub.className = 'chip-sub'
    sub.textContent = isToday ? 'Hôm nay' : shortWd

    const main = document.createElement('span')
    main.className = 'chip-main'
    main.textContent = shortDate

    button.append(sub, main)

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
  corner.textContent = 'Giải'
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

// a picked date never enters the 7-day strip: that strip stays "the last 7 draws"
async function showDay(iso: string) {
  ui.error.hidden = true
  ui.dayLabel.textContent = 'Đang tải…'
  renderLoading()
  try {
    current = await fetchDay(iso)
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
  renderLoading()
  try {
    recent = await fetchRecent()
    current = recent[0]
    const iso = current ? toIso(current.date) : undefined
    if (iso) {
      ui.dateInput.value = iso
    }
    renderTabs()
    renderBoard()
  } catch (error) {
    current = undefined
    renderBoard()
    ui.error.textContent =
      error instanceof Error ? error.message : 'Không tải được kết quả'
    ui.error.hidden = false
  } finally {
    loading = false
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

// updates are silent: check on launch, on every foreground return, and hourly.
// A newer bundle is downloaded and applied on the spot - no prompt, no button.
const AUTO_CHECK_MS = 60 * 60 * 1000
let autoCheckTimer = 0

async function autoUpdate() {
  if (!Capacitor.isNativePlatform() || loading) {
    return
  }
  const applied = await syncUpdate(false)
  if (applied) {
    showToast('Đã cập nhật bản mới')
  }
}

function startAutoUpdate() {
  // notifyAppReady must resolve first: if the native side times out waiting for it,
  // it rolls the current bundle back and a relaunch would re-download the same update
  void markAppReady().then(() => syncUpdate(true))
  window.clearInterval(autoCheckTimer)
  autoCheckTimer = window.setInterval(() => {
    void autoUpdate()
  }, AUTO_CHECK_MS)
}

void loadRecent()

if (Capacitor.isNativePlatform()) {
  startAutoUpdate()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void autoUpdate()
    }
  })
}
