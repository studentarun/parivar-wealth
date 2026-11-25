// Reads the family's existing "Finances" Excel tracker (Summary / Stocks / Mutual Funds /
// Sold fundsStocks / MF_Map / AMFI_NAV sheets) and turns it into app records.
import * as XLSX from 'xlsx'
import { defaultExitLoad, guessCategory, guessKind, guessTaxClass } from '../core/classify'
import { addDays, daysBetween, toISODate, todayIST } from '../core/dates'
import type { Instrument, PricePoint, SchemeRow, Txn } from '../core/types'

export interface ImportPlan {
  holders: string[]
  instruments: Omit<Instrument, 'id'>[]
  txns: (Omit<Txn, 'id' | 'holder_id' | 'instrument_id'> & { holder: string; instKey: string })[]
  prices: PricePoint[]
  sips: { holder: string; instKey: string; name: string; amount: number; day: number; last: string; count: number }[]
  schemes: SchemeRow[]
  warnings: string[]
  asOf: string
}

type Row = unknown[]
const num = (v: unknown) => (v == null || v === '' ? NaN : Number(String(v).replace(/[,₹\s]/g, '')))
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const ikey = (kind: string, code: string) => `${kind}:${code}`

function table(wb: XLSX.WorkBook, name: string, must: string): { head: string[]; rows: Row[] } | null {
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase().replace(/\s/g, '') === name.toLowerCase().replace(/\s/g, ''))
  if (!sheetName) return null
  const all = XLSX.utils.sheet_to_json<Row>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null })
  const hi = all.findIndex((r) => r.some((c) => str(c).toLowerCase() === must.toLowerCase()))
  if (hi < 0) return null
  return { head: all[hi].map((c) => str(c).toLowerCase()), rows: all.slice(hi + 1) }
}
const col = (head: string[], ...names: string[]) => {
  for (const n of names) {
    const i = head.indexOf(n.toLowerCase())
    if (i >= 0) return i
  }
  return -1
}

export function parseWorkbook(buf: ArrayBuffer): ImportPlan {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false })
  const warnings: string[] = []
  const holders = new Set<string>()
  const insts = new Map<string, Omit<Instrument, 'id'>>()
  const txns: ImportPlan['txns'] = []
  const prices: PricePoint[] = []

  // AMFI scheme list (code → proper name, latest NAV)
  const schemes: SchemeRow[] = []
  const nav = table(wb, 'AMFI_NAV', 'Scheme Code')
  if (nav) {
    const [c, n, v, d] = [col(nav.head, 'scheme code'), col(nav.head, 'scheme name'), col(nav.head, 'nav'), col(nav.head, 'nav date')]
    for (const r of nav.rows) {
      const code = str(r[c])
      const val = num(r[v])
      if (!code || !isFinite(val)) continue
      schemes.push({ code, name: str(r[n]), nav: val, nav_date: toISODate(r[d]) ?? '' })
    }
  }
  const schemeByCode = new Map(schemes.map((s) => [s.code, s]))

  // Fund name → AMFI code
  const map = new Map<string, { code: string; date: string | null; nav: number }>()
  const mfmap = table(wb, 'MF_Map', 'AMFI Scheme Code')
  if (mfmap) {
    for (const r of mfmap.rows) {
      const name = str(r[0])
      const code = str(r[1])
      if (name && code) map.set(name.toLowerCase(), { code, date: toISODate(r[2]), nav: num(r[3]) })
    }
  }
  let asOf = [...map.values()].map((m) => m.date).filter(Boolean).sort().pop() ?? todayIST()

  const addInst = (kind: 'MF' | 'STOCK' | 'ETF', code: string, name: string) => {
    const k = ikey(kind, code)
    if (!insts.has(k)) {
      const category = kind === 'STOCK' ? 'Stocks' : guessCategory(name, kind)
      const el = defaultExitLoad(kind, category)
      insts.set(k, {
        kind,
        code,
        name,
        category,
        tax_class: guessTaxClass(name, category, kind),
        exit_load_pct: el.pct,
        exit_load_days: el.days,
        keep: true,
      })
    }
    return k
  }

  // Mutual funds (active rows)
  const mf = table(wb, 'Mutual Funds', 'Scheme')
  if (mf) {
    const h = mf.head
    const [cD, cS, cH, cP, cU, cA, cCur, cSt] = [
      col(h, 'in month'),
      col(h, 'scheme'),
      col(h, 'maa/papa/self'),
      col(h, 'buy price/nav'),
      col(h, 'no of shares/units'),
      col(h, 'inv amt'),
      col(h, 'current price'),
      col(h, 'active/sold'),
    ]
    for (const r of mf.rows) {
      const scheme = str(r[cS])
      if (!scheme) continue
      if (cSt >= 0 && str(r[cSt]).toLowerCase() === 'sold') continue
      const m = map.get(scheme.toLowerCase())
      if (!m) {
        warnings.push(`No AMFI code for "${scheme}" in MF_Map — skipped`)
        continue
      }
      const date = toISODate(r[cD])
      const units = num(r[cU])
      const price = num(r[cP])
      const amount = num(r[cA])
      if (!date || !isFinite(units) || units === 0) continue
      const holder = str(r[cH])
      holders.add(holder)
      const sname = schemeByCode.get(m.code)?.name ?? scheme.replace(/^D\d+G\s+/, '')
      const k = addInst('MF', m.code, sname)
      // negative units in the sheet = a partial redemption at that day's NAV
      if (units < 0) txns.push({ holder, instKey: k, date, type: 'SELL', units: -units, price, amount: -units * price, status: 'done', source: 'import', note: 'redemption' })
      else txns.push({ holder, instKey: k, date, type: 'BUY', units, price, amount: isFinite(amount) ? amount : units * price, status: 'done', source: 'import' })
      prices.push({ key: `MF:${m.code}`, date, price })
      const cur = num(r[cCur])
      if (isFinite(cur) && m.date) prices.push({ key: `MF:${m.code}`, date: m.date, price: cur })
    }
  } else warnings.push('Sheet "Mutual Funds" not found')

  // Stocks / ETFs (current holdings)
  const st = table(wb, 'Stocks', 'SCRIP')
  if (st) {
    const h = st.head
    const [cD, cS, cH, cP, cU, cA, cCur] = [
      col(h, 'in month'),
      col(h, 'scrip'),
      col(h, 'maa/papa/self'),
      col(h, 'buy price'),
      col(h, 'no of shares'),
      col(h, 'inv amt'),
      col(h, 'current price'),
    ]
    for (const r of st.rows) {
      const scrip = str(r[cS])
      if (!scrip) continue
      const sym = scrip.replace(/^(NSE|BOM|BSE):/i, '').toUpperCase()
      const date = toISODate(r[cD])
      const units = num(r[cU])
      const price = num(r[cP])
      if (!date || !isFinite(units) || units === 0) continue
      if (/^BOM:|^BSE:/i.test(scrip)) warnings.push(`${scrip} is a BSE code — prices come from NSE, please check this stock`)
      const holder = str(r[cH])
      holders.add(holder)
      const k = addInst(guessKind(sym), sym, sym)
      const amount = num(r[cA])
      if (units < 0) txns.push({ holder, instKey: k, date, type: 'SELL', units: -units, price, amount: -units * price, status: 'done', source: 'import', note: 'redemption' })
      else txns.push({ holder, instKey: k, date, type: 'BUY', units, price, amount: isFinite(amount) ? amount : units * price, status: 'done', source: 'import' })
      const cur = num(r[cCur])
      if (isFinite(cur)) prices.push({ key: `NSE:${sym}`, date: asOf, price: cur })
    }
  }

  // Sold history (buy + sell pairs) — gives realised gains for past years
  const sold = table(wb, 'Sold fundsStocks', 'OUT')
  if (sold) {
    const h = sold.head
    const [cIn, cS, cH, cP, cU, cA, cOut, cSell, cSoldU] = [
      col(h, 'in'),
      col(h, 'scrip'),
      col(h, 'tarun/anu', 'maa/papa/self'),
      col(h, 'buy price/nav'),
      col(h, 'no of shares/units'),
      col(h, 'inv amt'),
      col(h, 'out'),
      col(h, 'sell price'),
      col(h, 'no of shares sold'),
    ]
    for (const r of sold.rows) {
      const scrip = str(r[cS])
      const din = toISODate(r[cIn])
      const dout = toISODate(r[cOut])
      const units = num(r[cU])
      const sp = num(r[cSell])
      if (!scrip || !din || !dout || !isFinite(units) || !isFinite(sp)) continue
      const holder = str(r[cH])
      holders.add(holder)
      let k: string
      if (/^MUTF_IN:/i.test(scrip)) k = addInst('MF', scrip.replace(/^MUTF_IN:/i, ''), scrip.replace(/^MUTF_IN:/i, '').replace(/_/g, ' '))
      else {
        const sym = scrip.replace(/^(NSE|BOM|BSE):/i, '').toUpperCase()
        k = addInst(guessKind(sym), sym, sym)
      }
      const amount = num(r[cA])
      const su = num(r[cSoldU])
      txns.push({ holder, instKey: k, date: din, type: 'BUY', units, price: num(r[cP]), amount: isFinite(amount) ? amount : units * num(r[cP]), status: 'done', source: 'import', note: 'from sold sheet' })
      txns.push({ holder, instKey: k, date: dout, type: 'SELL', units: isFinite(su) ? su : units, price: sp, amount: (isFinite(su) ? su : units) * sp, status: 'done', source: 'import', note: 'from sold sheet' })
    }
  }

  // Detect running SIPs: ≥3 regular buys of the same amount in the last ~4 months
  const sips: ImportPlan['sips'] = []
  const groups = new Map<string, typeof txns>()
  for (const t of txns) {
    if (t.type !== 'BUY' || t.note) continue
    const g = groups.get(`${t.holder}|${t.instKey}`) ?? []
    g.push(t)
    groups.set(`${t.holder}|${t.instKey}`, g)
  }
  const cutoff = addDays(asOf, -125)
  for (const [k, g] of groups) {
    const recent = g
      .filter((t) => t.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-3)
    if (recent.length < 3) continue
    const amts = recent.map((t) => t.amount ?? 0)
    const med = amts.slice().sort((a, b) => a - b)[Math.floor(amts.length / 2)]
    if (!amts.every((a) => Math.abs(a - med) / med < 0.05)) continue
    const gaps = recent.slice(1).map((t, i) => daysBetween(recent[i].date, t.date))
    if (!gaps.every((d) => d >= 20 && d <= 40)) continue
    const days = recent.map((t) => Number(t.date.slice(8, 10)))
    const day = Math.min(...days)
    const [holder, instKey] = k.split('|')
    const last = recent[recent.length - 1].date
    sips.push({ holder, instKey, name: insts.get(instKey)!.name, amount: Math.round(med / 100) * 100 || Math.round(med), day, last, count: g.length })
  }

  if (!txns.length) warnings.push('No transactions found — is this the right file?')
  asOf = asOf || todayIST()
  return { holders: [...holders].filter(Boolean), instruments: [...insts.values()], txns, prices, sips, schemes, warnings, asOf }
}
