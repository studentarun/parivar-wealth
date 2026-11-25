/**
 * Nightly job (GitHub Actions, free):
 *  1. AMFI NAVAll.txt  → all mutual fund NAVs (official source)   → amfi_schemes + prices
 *  2. AMFI NAV history → back-fill NAVs for any missed SIP / order dates
 *  3. NSE bhavcopy     → official end-of-day close for stocks/ETFs → nse_symbols + prices
 *  4. Auto-invest due SIP instalments and fill pending orders (same logic as the app)
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (service role key — GitHub secret, never in the app)
 */
import { createClient } from '@supabase/supabase-js'
import { unzipSync, strFromU8 } from 'fflate'
import { addDays, todayIST } from '../src/core/dates'
import { parseBhav, parseNavAll, parseNavHistory } from './parsers'
import { PriceBook } from '../src/core/prices'
import { DEFAULT_RULES } from '../src/core/rules'
import { dueDates, fillPending, runSips } from '../src/core/sip'
import { type Instrument, type PricePoint, type Sip, type TaxRules, type Txn } from '../src/core/types'

const URL_ = process.env.SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_KEY!
if (!URL_ || !KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing')
const sb = createClient(URL_, KEY, { auth: { persistSession: false } })
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', Accept: '*/*' }
const today = todayIST()
const lines: string[] = []
let problem = false
const log = (...a: unknown[]) => {
  const l = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ')
  lines.push(l)
  console.log(new Date().toISOString().slice(11, 19), l)
}
async function saveStatus(ok: boolean) {
  // Shown in the app under More → Price updates
  await sb.from('settings').upsert({ key: 'nightly_status', value: { ok, at: new Date().toISOString(), today, lines: lines.slice(-40) } })
}

async function all<T>(table: string, select = '*', filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select)
    if (filter) q = filter(q)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}
async function upsert(table: string, rows: object[], onConflict?: string) {
  const keyOf = (r: any) => (onConflict === 'key,date' ? `${r.key}|${r.date}` : (r.code ?? r.symbol ?? JSON.stringify(r)))
  rows = [...new Map(rows.map((r) => [keyOf(r), r])).values()]
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 1000), onConflict ? { onConflict } : undefined)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}
async function get(url: string, tries = 3): Promise<Response> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA })
      if (r.ok) return r
      last = new Error(`${r.status} ${url}`)
    } catch (e) {
      last = e
    }
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)))
  }
  throw last
}
const amfiDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')}-${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}-${y}`
}

// ───────── 1. AMFI latest NAVs ─────────
async function amfiLatest(tracked: Set<string>) {
  let schemes: ReturnType<typeof parseNavAll> = []
  for (const url of ['https://portal.amfiindia.com/spages/NAVAll.txt', 'https://www.amfiindia.com/spages/NAVAll.txt']) {
    try {
      const txt = await (await get(url)).text()
      schemes = parseNavAll(txt)
      log(`AMFI ${url}: ${txt.length} bytes, ${schemes.length} schemes`)
      if (schemes.length > 1000) break
    } catch (e) {
      log(`AMFI ${url} failed: ${String(e)}`)
    }
  }
  if (schemes.length < 1000) throw new Error('AMFI NAV file could not be read')
  // a scheme code can appear twice in the file — keep the last one so upsert doesn't fail
  schemes = [...new Map(schemes.map((x) => [x.code, x])).values()]
  log(`AMFI: ${schemes.length} schemes`)
  await upsert('amfi_schemes', schemes)
  const prices = schemes.filter((s) => tracked.has(s.code)).map((s) => ({ key: `MF:${s.code}`, date: s.nav_date, price: s.nav }))
  await upsert('prices', prices, 'key,date')
  log(`AMFI: ${prices.length} tracked NAVs saved`)
}

// ───────── 2. AMFI NAV history back-fill ─────────
async function amfiHistory(tracked: Set<string>, from: string, to: string) {
  let cur = from
  let n = 0
  while (cur <= to) {
    const end = addDays(cur, 30) < to ? addDays(cur, 30) : to
    const url = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${amfiDate(cur)}&todt=${amfiDate(end)}`
    try {
      const txt = await (await get(url)).text()
      const rows = parseNavHistory(txt, tracked)
      await upsert('prices', rows, 'key,date')
      n += rows.length
    } catch (e) {
      log('AMFI history failed', cur, end, String(e))
    }
    cur = addDays(end, 1)
  }
  log(`AMFI history ${from}..${to}: ${n} NAVs`)
}

// ───────── 3. NSE bhavcopy ─────────
async function nseDay(day: string, tracked: Set<string>, saveSymbols: boolean): Promise<boolean> {
  const ymd = day.replace(/-/g, '')
  const url = `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${ymd}_F_0000.csv.zip`
  let csv: string
  try {
    const buf = new Uint8Array(await (await get(url, 2)).arrayBuffer())
    const files = unzipSync(buf)
    csv = strFromU8(Object.values(files)[0])
  } catch {
    return false // holiday / not published / blocked
  }
  const { syms, prices } = parseBhav(csv, day, tracked)
  if (saveSymbols) await upsert('nse_symbols', syms)
  await upsert('prices', prices, 'key,date')
  log(`NSE ${day}: ${syms.length} symbols, ${prices.length} tracked`)
  return true
}

async function yahooFallback(symbols: string[]) {
  // Used only if NSE blocks the download. Yahoo mirrors NSE closes (unofficial).
  const rows: PricePoint[] = []
  for (const s of symbols) {
    try {
      const j: any = await (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}.NS?range=10d&interval=1d`, 2)).json()
      const r = j.chart.result[0]
      r.timestamp.forEach((t: number, i: number) => {
        const close = r.indicators.quote[0].close[i]
        if (close != null) rows.push({ key: `NSE:${s}`, date: todayIST(new Date(t * 1000)), price: Math.round(close * 100) / 100 })
      })
    } catch (e) {
      log('yahoo failed', s, String(e))
    }
  }
  await upsert('prices', rows, 'key,date')
  log(`Yahoo fallback: ${rows.length} closes`)
}

// ───────── 4. Month-end price history (for the Trends charts), filled a few years at a time ─────────
async function backfillMonthEnds(mfCodes: Set<string>, nseSyms: Set<string>) {
  const first = (await sb.from('txns').select('date').order('date').limit(1)).data?.[0]?.date as string | undefined
  if (!first) return
  const st = (await sb.from('settings').select('value').eq('key', 'backfill').maybeSingle()).data?.value as { done?: string[] } | undefined
  const done = new Set(st?.done ?? [])
  const months: string[] = []
  let [y, m] = first.split('-').map(Number)
  const thisMonth = today.slice(0, 7)
  for (;;) {
    const mk = `${y}-${String(m).padStart(2, '0')}`
    if (mk >= thisMonth) break
    if (!done.has(mk)) months.push(mk)
    m++
    if (m > 12) (m = 1), y++
  }
  if (!months.length) return
  const batch = months.reverse().slice(0, 30) // newest first
  let nseOk = 0
  let nseFail = 0
  for (const mk of batch) {
    const [yy, mm] = mk.split('-').map(Number)
    const end = `${mk}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`
    if (mfCodes.size) {
      try {
        const txt = await (await get(`https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${amfiDate(addDays(end, -5))}&todt=${amfiDate(end)}`)).text()
        await upsert('prices', parseNavHistory(txt, mfCodes), 'key,date')
      } catch (e) {
        log(`backfill AMFI ${mk} failed: ${String(e)}`)
        continue
      }
    }
    if (nseSyms.size && nseFail < 3) {
      let got = false
      for (let d = end; d >= addDays(end, -6) && !got; d = addDays(d, -1)) {
        const dow = new Date(d + 'T00:00:00Z').getUTCDay()
        if (dow === 0 || dow === 6) continue
        got = await nseDay(d, nseSyms, false)
      }
      if (got) nseOk++
      else nseFail++
    }
    done.add(mk)
  }
  if (nseSyms.size && nseFail >= 3) await yahooMonthly([...nseSyms])
  await sb.from('settings').upsert({ key: 'backfill', value: { done: [...done].sort() } })
  log(`Month-end history: ${batch.length} months filled (${months.length - batch.length} left)${nseSyms.size ? `, NSE ok ${nseOk}` : ''}`)
}

async function yahooMonthly(symbols: string[]) {
  const rows: PricePoint[] = []
  for (const s of symbols) {
    try {
      const j: any = await (await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}.NS?range=10y&interval=1mo`, 2)).json()
      const r = j.chart.result[0]
      r.timestamp.forEach((t: number, i: number) => {
        const close = r.indicators.quote[0].close[i]
        if (close == null) return
        const d = new Date(t * 1000 + 6 * 3600000)
        const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
        if (end < today) rows.push({ key: `NSE:${s}`, date: end, price: Math.round(close * 100) / 100 })
      })
    } catch {
      /* delisted / renamed symbols */
    }
  }
  await upsert('prices', rows, 'key,date')
  log(`Yahoo monthly history: ${rows.length} month-end closes (NSE archive blocked)`)
}

// ───────── main ─────────
async function main() {
  const instruments = await all<Instrument>('instruments')
  const sips = (await all<Sip>('sips')).map((s) => ({ ...s, amount: Number(s.amount) }))
  const pending = (await all<Txn>('txns', '*', (q) => q.eq('status', 'pending'))).map((t) => ({ ...t, units: t.units == null ? null : Number(t.units), amount: t.amount == null ? null : Number(t.amount) }))
  const rulesRow = await sb.from('settings').select('value').eq('key', 'tax_rules').maybeSingle()
  const rules: TaxRules = { ...DEFAULT_RULES, ...((rulesRow.data?.value as TaxRules) ?? {}) }
  const mfCodes = new Set(instruments.filter((i) => i.kind === 'MF').map((i) => i.code))
  const nseSyms = new Set(instruments.filter((i) => i.kind !== 'MF').map((i) => i.code))

  // Which past dates do we need prices for? (oldest unprocessed SIP instalment / pending order)
  const instById = new Map(instruments.map((i) => [i.id, i]))
  let need = today
  for (const s of sips) if (s.active) for (const d of dueDates(s, s.last_run_date, today).slice(0, 1)) if (d < need) need = d
  for (const t of pending) if (t.date < need) need = t.date
  const needFrom = need < addDays(today, -120) ? addDays(today, -120) : need
  log(`today ${today}; need prices from ${needFrom}; ${mfCodes.size} funds, ${nseSyms.size} stocks/ETFs tracked`)

  try {
    await amfiLatest(mfCodes)
  } catch (e) {
    problem = true
    log('AMFI latest failed: ' + String(e))
  }
  if (mfCodes.size && needFrom < addDays(today, -1)) {
    await amfiHistory(mfCodes, needFrom, addDays(today, -1))
  }

  if (nseSyms.size) {
    let ok = 0
    const start = needFrom < addDays(today, -10) ? addDays(today, -10) : needFrom
    for (let d = today; d >= start; d = addDays(d, -1)) {
      const dow = new Date(d + 'T00:00:00Z').getUTCDay()
      if (dow === 0 || dow === 6) continue
      const { count } = await sb.from('prices').select('key', { count: 'exact', head: true }).like('key', 'NSE:%').eq('date', d)
      if (count && d !== today) continue
      if (await nseDay(d, nseSyms, ok === 0)) ok++
    }
    if (!ok) {
      log('NSE bhavcopy not reachable — using Yahoo fallback')
      await yahooFallback([...nseSyms])
    }
  }

  try {
    await backfillMonthEnds(mfCodes, nseSyms)
  } catch (e) {
    log('Month-end history failed: ' + String(e))
  }

  // SIPs + pending orders
  const pts = await all<PricePoint>('prices', 'key,date,price', (q) => q.gte('date', addDays(needFrom, -3)))
  const book = new PriceBook(pts.map((p) => ({ ...p, price: Number(p.price) })))
  const run = runSips(sips, instruments, book, today, rules)
  if (run.newTxns.length) {
    const { error } = await sb.from('txns').insert(run.newTxns)
    if (error) throw error
  }
  for (const u of run.sipUpdates) await sb.from('sips').update({ last_run_date: u.last_run_date }).eq('id', u.id)
  const fills = fillPending(pending, instruments, book, today, rules)
  for (const f of fills) await sb.from('txns').update(f.patch).eq('id', f.id)
  log(`SIP instalments added: ${run.newTxns.length}; pending orders filled: ${fills.length}`)
  for (const t of run.newTxns) log('  +', instById.get(t.instrument_id)?.name, t.date, t.amount, '@', t.price)
}

main()
  .then(() => saveStatus(!problem))
  .catch(async (e) => {
    console.error(e)
    log('FAILED: ' + (e?.message ?? String(e)))
    await saveStatus(false).catch(() => {})
    process.exit(1)
  })
