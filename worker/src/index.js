// XSMN proxy + permanent cache. Scrapes minhngoc (no CORS header upstream), serves JSON with CORS.
// A draw never changes once it happened, so each finished day is written to KV once and never again.
const BASE = 'https://www.minhngoc.net.vn/ket-qua-xo-so/mien-nam'
const INDEX_KEY = 'xsmn:index'
const INDEX_MAX = 90
const RECENT = 7
const TODAY_TTL = 300
// XSMN draws 16:10-16:40 ICT, so anything at or after this minute is final even for today
const FINAL_MINUTE_ICT = 16 * 60 + 45

const HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: HEADERS })
    }

    const asked = new URL(request.url).searchParams.get('date')
    if (asked) {
      const iso = toIso(asked)
      if (!iso) {
        return new Response(JSON.stringify({ error: 'date must be yyyy-mm-dd' }), {
          status: 400,
          headers: HEADERS,
        })
      }

      const cached = await env.CACHE.get(`xsmn:day:${iso}`, 'json')
      if (cached) {
        return respond({ days: [cached] }, 'hit')
      }

      const scraped = (await scrape(toUrlDate(iso)))?.filter((d) => toIso(d.date) === iso)
      if (!scraped || scraped.length === 0) {
        return new Response(JSON.stringify({ error: 'no results for that date' }), {
          status: 404,
          headers: HEADERS,
        })
      }
      ctx.waitUntil(store(env, scraped))
      return respond({ days: scraped }, 'miss')
    }

    const today = todayIso()
    const current = await env.CACHE.get(`xsmn:day:${today}`, 'json')
    // once today's draw is final it also lands in the index, so drop it from the older list
    const finals = (await readRecent(env)).filter((day) => toIso(day.date) !== today)

    if (current) {
      return respond({ days: [current, ...finals].slice(0, RECENT) }, 'hit')
    }

    // checked recently and the draw is not out yet -> do not hit upstream again
    if (await env.CACHE.get(`xsmn:pending:${today}`)) {
      return respond({ days: finals }, 'pending')
    }

    const scraped = await scrape()
    if (!scraped) {
      return finals.length > 0
        ? respond({ days: finals }, 'stale')
        : new Response(JSON.stringify({ error: 'upstream fetch failed' }), {
            status: 502,
            headers: HEADERS,
          })
    }

    ctx.waitUntil(store(env, scraped))
    // draw not out yet -> don't hammer upstream for the next 5 minutes
    if (!scraped.some((day) => toIso(day.date) === today) && !isFinal(today)) {
      ctx.waitUntil(
        env.CACHE.put(`xsmn:pending:${today}`, '1', { expirationTtl: TODAY_TTL }),
      )
    }
    return respond({ days: scraped.slice(0, RECENT) }, 'miss')
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      scrape().then((days) => {
        if (!days) {
          return
        }
        // refresh today's not-yet-final entry so the index points at fresh data
        return store(env, days)
      }),
    )
  },
}

function respond(body, status) {
  return new Response(JSON.stringify(body), {
    headers: { ...HEADERS, 'x-cache': status },
  })
}

async function readRecent(env) {
  const index = (await env.CACHE.get(INDEX_KEY, 'json')) ?? []
  const days = await Promise.all(
    index.slice(0, RECENT).map((iso) => env.CACHE.get(`xsmn:day:${iso}`, 'json')),
  )
  return days.filter(Boolean)
}

async function store(env, days) {
  // a day is permanent once it is in the past, or once today's draw window has closed
  await Promise.all(
    days.map((day) => {
      const iso = toIso(day.date)
      if (!iso) {
        return Promise.resolve()
      }
      const key = `xsmn:day:${iso}`
      return isFinal(iso)
        ? env.CACHE.put(key, JSON.stringify(day))
        : env.CACHE.put(key, JSON.stringify(day), { expirationTtl: TODAY_TTL })
    }),
  )

  const finished = days.map((d) => toIso(d.date)).filter((iso) => iso && isFinal(iso))
  if (finished.length === 0) {
    return
  }

  const index = (await env.CACHE.get(INDEX_KEY, 'json')) ?? []
  const merged = [...new Set([...finished, ...index])].sort().reverse().slice(0, INDEX_MAX)
  await env.CACHE.put(INDEX_KEY, JSON.stringify(merged))
}

export async function scrape(date) {
  // ponytail: no cache-buster, KV holds the finished days anyway
  const res = await fetch(date ? `${BASE}/${date}.html` : `${BASE}.html`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; xsmn-cache/1.0)' },
  })
  if (!res.ok) {
    return null
  }
  const days = parseDays(await res.text())
  return days.length > 0 ? days : null
}

export function parseDays(html) {
  const days = []
  for (const box of html.split('<div class="box_kqxs">').slice(1)) {
    const date = match(box, /KẾT QUẢ XỔ SỐ Miền Nam<\/a>\s*-\s*<a[^>]*>\s*([\d/]+)\s*</)
    const weekday = match(box, /<td class="thu">\s*<a[^>]*>([^<]+)</)
    if (!date) {
      continue
    }

    const provinces = []
    for (const table of box.split('<table cellpadding="0" cellspacing="0" class="rightcl"').slice(1)) {
      const name = match(table, /class="tinh">\s*<a[^>]*>([^<]+)</)
      if (!name) {
        continue
      }
      const prizes = {}
      for (const [, key, cell] of table.matchAll(
        /<td class="(giaidb|giai[1-8])">([\s\S]*?)<\/td>/g,
      )) {
        const numbers = [...cell.matchAll(/<div>\s*(\d+)\s*<\/div>/g)].map((m) => m[1])
        if (numbers.length > 0) {
          prizes[prizeKey(key)] = numbers
        }
      }
      provinces.push({ name, code: match(table, /class="matinh">\s*([^<]+)</) ?? '', prizes })
    }

    if (provinces.length > 0) {
      days.push({ date, weekday: weekday ?? '', provinces })
    }
  }
  return days
}

function match(text, re) {
  const found = text.match(re)
  return found ? found[1].trim() : undefined
}

function prizeKey(cls) {
  return cls === 'giaidb' ? 'db' : `g${cls.slice(4)}`
}

// dd/mm/yyyy or dd-mm-yyyy or yyyy-mm-dd -> yyyy-mm-dd (used as KV key and for ordering)
export function toIso(date) {
  const trimmed = date.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }
  const found = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (!found) {
    return undefined
  }
  const [, d, m, y] = found
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// yyyy-mm-dd -> dd-mm-yyyy (minhngoc url form)
function toUrlDate(iso) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

// ICT (UTC+7) - the draws finish around 16:40 ICT
function todayIso() {
  return ictNow().slice(0, 10)
}

function ictNow() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString()
}

// a day is final once its date is behind us, or once today's draw window has closed
export function isFinal(iso) {
  const now = ictNow()
  const today = now.slice(0, 10)
  if (iso < today) {
    return true
  }
  if (iso > today) {
    return false
  }
  const minutes = Number(now.slice(11, 13)) * 60 + Number(now.slice(14, 16))
  return minutes >= FINAL_MINUTE_ICT
}
