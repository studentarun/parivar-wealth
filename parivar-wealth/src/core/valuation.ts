import { daysBetween } from './dates'
import { costOf, ltDate, unitsOf, type Position } from './lots'
import type { PriceBook } from './prices'
import { priceKey, type Category, type TaxRules } from './types'

export function xirr(flows: { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null
  const pos = flows.some((f) => f.amount > 0)
  const neg = flows.some((f) => f.amount < 0)
  if (!pos || !neg) return null
  const d0 = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date)
  const ts = flows.map((f) => ({ t: daysBetween(d0, f.date) / 365, a: f.amount }))
  if (Math.max(...ts.map((x) => x.t)) < 30 / 365) return null
  const npv = (r: number) => ts.reduce((s, x) => s + x.a / Math.pow(1 + r, x.t), 0)
  let lo = -0.99
  let hi = 10
  let flo = npv(lo)
  const fhi = npv(hi)
  if (flo * fhi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (Math.abs(fm) < 1e-7) return mid
    if (fm * flo < 0) hi = mid
    else (lo = mid), (flo = fm)
  }
  return (lo + hi) / 2
}

export interface Holding {
  pos: Position
  units: number
  invested: number
  price: number | null
  priceDate: string | null
  value: number
  gain: number
  ltGain: number // gain on units that are already long-term
  stGain: number
  xirr: number | null
  category: Category
}

export function valueHoldings(positions: Position[], book: PriceBook, today: string, r: TaxRules): Holding[] {
  return positions
    .map((p) => {
      const units = unitsOf(p)
      const invested = costOf(p)
      const lp = book.latest(priceKey(p.instrument))
      const price = lp?.price ?? null
      const value = price != null ? units * price : invested
      let ltGain = 0
      let stGain = 0
      for (const l of p.lots) {
        const g = l.units * ((price ?? l.cost_per_unit) - l.cost_per_unit)
        const lt = ltDate(l.date, p.instrument.tax_class, r)
        if (lt && today >= lt) ltGain += g
        else stGain += g
      }
      const flows = p.txns
        .filter((t) => t.status === 'done' && t.units)
        .map((t) => ({
          date: t.date,
          amount: t.type === 'BUY' ? -(t.amount ?? (t.units ?? 0) * (t.price ?? 0)) : (t.units ?? 0) * (t.price ?? 0),
        }))
      if (value > 0) flows.push({ date: today, amount: value })
      return {
        pos: p,
        units,
        invested,
        price,
        priceDate: lp?.date ?? null,
        value,
        gain: value - invested,
        ltGain,
        stGain,
        xirr: xirr(flows),
        category: p.instrument.category,
      }
    })
    .filter((h) => h.units > 1e-6)
}

export function sumH(hs: Holding[]) {
  const invested = hs.reduce((s, h) => s + h.invested, 0)
  const value = hs.reduce((s, h) => s + h.value, 0)
  const flows = hs.flatMap((h) =>
    h.pos.txns
      .filter((t) => t.status === 'done' && t.units)
      .map((t) => ({
        date: t.date,
        amount: t.type === 'BUY' ? -(t.amount ?? (t.units ?? 0) * (t.price ?? 0)) : (t.units ?? 0) * (t.price ?? 0),
      })),
  )
  return { invested, value, gain: value - invested, flows }
}
