import { Capacitor } from '@capacitor/core'
import './index.css'
import {
  checkForUpdate,
  currentBundleLabel,
  installUpdate,
  markAppReady,
} from './ota.ts'
import type { AvailableUpdate } from './ota.ts'
import {
  clearDone,
  createTodo,
  loadTodos,
  openCount,
  removeTodo,
  saveTodos,
  toggleTodo,
  visibleTodos,
} from './todos.ts'
import type { Todo, TodoFilter } from './todos.ts'

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
  summary: requiredElement('#summary', HTMLElement),
  form: requiredElement('#todo-form', HTMLFormElement),
  input: requiredElement('#todo-input', HTMLInputElement),
  list: requiredElement('#todo-list', HTMLElement),
  empty: requiredElement('#empty', HTMLElement),
  clearDone: requiredElement('#clear-done', HTMLButtonElement),
  toast: requiredElement('#toast', HTMLElement),
}

const filterButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-filter]'),
)

let todos = loadTodos()
let filter: TodoFilter = 'all'
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

function persist() {
  saveTodos(todos)
  render()
}

function summaryText(): string {
  if (todos.length === 0) {
    return 'Chưa có việc nào. Thêm việc đầu tiên ở bên dưới.'
  }
  const open = openCount(todos)
  if (open === 0) {
    return `Xong hết ${todos.length} việc.`
  }
  return `${open} việc chưa xong · ${todos.length} việc tổng.`
}

function emptyText(): string {
  if (filter === 'open') {
    return 'Không còn việc đang làm.'
  }
  if (filter === 'done') {
    return 'Chưa có việc đã xong.'
  }
  return 'Chưa có việc trong mục này.'
}

function render() {
  const visible = visibleTodos(todos, filter)
  ui.summary.textContent = summaryText()
  ui.empty.hidden = visible.length > 0
  ui.empty.textContent = emptyText()
  ui.clearDone.hidden = !todos.some((todo) => todo.done)
  ui.list.replaceChildren()

  for (const todo of visible) {
    ui.list.append(renderItem(todo))
  }

  for (const button of filterButtons) {
    button.classList.toggle('is-on', button.dataset.filter === filter)
  }
}

function renderItem(todo: Todo): HTMLLIElement {
  const item = document.createElement('li')
  item.className = todo.done ? 'todo-item is-done' : 'todo-item'

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = todo.done
  checkbox.addEventListener('change', () => {
    todos = toggleTodo(todos, todo.id)
    persist()
  })

  const label = document.createElement('label')
  const labelId = `todo-${todo.id}`
  checkbox.id = labelId
  label.htmlFor = labelId
  label.textContent = todo.title

  const remove = document.createElement('button')
  remove.className = 'icon-btn'
  remove.type = 'button'
  remove.setAttribute('aria-label', 'Xóa việc')
  remove.textContent = 'Xóa'
  remove.addEventListener('click', () => {
    todos = removeTodo(todos, todo.id)
    persist()
  })

  item.append(checkbox, label, remove)
  return item
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

ui.form.addEventListener('submit', (event) => {
  event.preventDefault()
  const todo = createTodo(ui.input.value)
  if (!todo) {
    return
  }
  todos = [todo, ...todos]
  ui.input.value = ''
  persist()
  ui.input.focus()
})

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    const next = button.dataset.filter
    if (next === 'all' || next === 'open' || next === 'done') {
      filter = next
      render()
    }
  })
}

ui.clearDone.addEventListener('click', () => {
  todos = clearDone(todos)
  persist()
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

render()

if (Capacitor.isNativePlatform()) {
  void markAppReady()
  void runCheck(false)
} else {
  void refreshBuildLabel()
}
