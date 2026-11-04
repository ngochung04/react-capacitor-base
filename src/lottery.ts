export type Province = {
  name: string
  code: string
  prizes: Record<string, string[]>
}

export type Day = {
  date: string
  weekday: string
  provinces: Province[]
}

// ponytail: prod URL is the default; VITE_LOTTERY_API only exists for pointing at wrangler dev
const API = (
  import.meta.env.VITE_LOTTERY_API ?? 'https://xsmn-api.zxccc.workers.dev'
).replace(/\/$/, '')

async function request(query: string): Promise<Day[]> {
  const res = await fetch(`${API}${query}`, { cache: 'no-cache' })
  if (res.status === 404) {
    throw new Error('Không có kết quả cho ngày này')
  }
  if (!res.ok) {
    throw new Error(`Máy chủ trả lỗi ${res.status}`)
  }

  const body = (await res.json()) as { days?: Day[]; error?: string }
  if (!Array.isArray(body.days) || body.days.length === 0) {
    throw new Error(body.error ?? 'Chưa có kết quả')
  }

  return body.days
}

// one day, any date the server has ever stored (KV is permanent per day)
export async function fetchDay(isoDate: string): Promise<Day> {
  const days = await request(`/?date=${encodeURIComponent(isoDate)}`)
  return days[0]
}

export async function fetchRecent(): Promise<Day[]> {
  return request('')
}
