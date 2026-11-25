import { addDays, daysInMonth, pad } from './dates'
import { buildPositions, costOf, unitsOf } from './lots'
import type { PriceBook } from './prices'
import { priceKey, type Instrument, type TaxRules, type Txn } from './types'

export interface MonthPoint {
  month: string // YYYY-MM
  label: string // Nov 26
  invested: number // cost of units still held at month end
  value: number
  regular: number // SIP-like buys during the month
  oneTime: number
  byHolder: Record<string, number> // buys during the month per holder
  withdrawn: number
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A buy is "regular" (SIP) if it came from a SIP, or the same fund got a similar amount ~a month before/after. */
export function regularBuyIds(txns: Txn[]): Set<string> {
  const out = new Set<string>()
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    if (t.type !== 'BUY' || t.status !== 'done') continue
    const k = `${t.holder_id}|${t.instrument_id}`
    const g = groups.get(k) ?? []
    g.push(t)
    groups.set(k, g)
  }
  for (const g of groups.values()) {
    g.sort((a, b) => a.date.localeCompare(b.date))
    for (let i = 0; i < g.length; i++) {
      const t = g[i]
      if (t.source === 'sip') {
        out.add(t.id)
        continue
      }
      const amt = t.amount ?? 0
      const near = [g[i - 1], g[i + 1]].some((o) => {
        if (!o) return false
        const days = Math.abs((Date.parse(o.date) - Date.parse(t.date)) / 86400000)
        const oa = o.amount ?? 0
        return days >= 20 && days <= 40 && Math.abs(oa - amt) <= 0.15 * Math.max(amt, oa)
      })
      if (near) out.add(t.id)
    }
  }
  return out
}

export function monthlySeries(txns: Txn[], instruments: Instrument[], book: PriceBook, rules: TaxRules, today: string): MonthPoint[] {
  const done = txns.filter((t) => t.status === 'done' && t.units)
  if (!done.length) return []
  const first = done.reduce((m, t) => (t.date < m ? t.date : m), done[0].date)
  const regular = regularBuyIds(done)
  const out: MonthPoint[] = []
  let [y, m] = first.split('-').map(Number)
  const [ty, tm] = today.split('-').map(Number)
  const inst = new Map(instruments.map((i) => [i.id, i]))
  while (y < ty || (y === ty && m <= tm)) {
    const mk = `${y}-${pad(m)}`
    const end = y === ty && m === tm ? today : `${mk}-${pad(daysInMonth(y, m))}`
    const upto = done.filter((t) => t.date <= end)
    const positions = buildPositions(upto, instruments, rules)
    let invested = 0
    let value = 0
    for (const p of positions) {
      const u = unitsOf(p)
      if (u <= 1e-6) continue
      const c = costOf(p)
      invested += c
      const px = book.onOrBefore(priceKey(inst.get(p.instrument.id)!), end)
      // no price known yet at that date → use the most recent buy price as an estimate
      value += px ? u * px.price : c
    }
    const inMonth = done.filter((t) => t.date.startsWith(mk))
    const pt: MonthPoint = { month: mk, label: `${MON[m - 1]} ${String(y).slice(2)}`, invested, value, regular: 0, oneTime: 0, byHolder: {}, withdrawn: 0 }
    for (const t of inMonth) {
      const amt = t.amount ?? (t.units ?? 0) * (t.price ?? 0)
      if (t.type === 'SELL') {
        pt.withdrawn += amt
        continue
      }
      if (regular.has(t.id)) pt.regular += amt
      else pt.oneTime += amt
      pt.byHolder[t.holder_id] = (pt.byHolder[t.holder_id] ?? 0) + amt
    }
    out.push(pt)
    m++
    if (m > 12) (m = 1), y++
  }
  return out
}

export const monthEnd = (mk: string) => {
  const [y, m] = mk.split('-').map(Number)
  return `${mk}-${pad(daysInMonth(y, m))}`
}
export const prevMonthEnd = (d: string) => addDays(`${d.slice(0, 7)}-01`, -1)
