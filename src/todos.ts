export type Todo = {
  id: string
  title: string
  done: boolean
  createdAt: number
}

export type TodoFilter = 'all' | 'open' | 'done'

const STORAGE_KEY = 'starter-todos'

export function loadTodos(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(isTodo)
  } catch {
    return []
  }
}

export function saveTodos(todos: Todo[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
}

export function createTodo(title: string, now = Date.now()): Todo | undefined {
  const trimmed = title.trim()
  if (!trimmed) {
    return undefined
  }

  return {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: trimmed,
    done: false,
    createdAt: now,
  }
}

export function toggleTodo(todos: Todo[], id: string): Todo[] {
  return todos.map((todo) =>
    todo.id === id ? { ...todo, done: !todo.done } : todo,
  )
}

export function removeTodo(todos: Todo[], id: string): Todo[] {
  return todos.filter((todo) => todo.id !== id)
}

export function clearDone(todos: Todo[]): Todo[] {
  return todos.filter((todo) => !todo.done)
}

export function visibleTodos(todos: Todo[], filter: TodoFilter): Todo[] {
  if (filter === 'open') {
    return todos.filter((todo) => !todo.done)
  }
  if (filter === 'done') {
    return todos.filter((todo) => todo.done)
  }
  return todos
}

export function openCount(todos: Todo[]): number {
  return todos.filter((todo) => !todo.done).length
}

function isTodo(value: unknown): value is Todo {
  if (!value || typeof value !== 'object') {
    return false
  }
  const todo = value as Todo
  return (
    typeof todo.id === 'string' &&
    typeof todo.title === 'string' &&
    typeof todo.done === 'boolean' &&
    typeof todo.createdAt === 'number'
  )
}
