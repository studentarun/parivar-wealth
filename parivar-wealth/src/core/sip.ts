import { addDays, addMonths, monthDate } from './dates'
import type { PriceBook } from './prices'
import { priceKey, type Instrument, type Sip, type TaxRules, type Txn } from './types'

/** SIP due dates after `after` (exclusive) up to `upto` (inclusive). */
export function dueDates(sip: Sip, after: string | null | undefined, upto: string): string[] {
  const out: string[] = []
  let [y, m] = sip.start_date.split('-').map(Number)
  let d = monthDate(y, m, sip.day)
  if (d < sip.start_date) {
    const n = addMonths(`${y}-${String(m).padStart(2, '0')}-01`, 1)
    ;[y, m] = n.split('-').map(Number)
    d = monthDate(y, m, sip.day)
  }
  for (let i = 0; i < 600 && d <= upto; i++) {
    if (sip.end_date && d > sip.end_date) break
    if (!after || d > after) out.push(d)
    m += 1
    if (m > 12) (m = 1), (y += 1)
    d = monthDate(y, m, sip.day)
  }
  return out
}

export const roundUnits = (u: number, kind: Instrument['kind']) => (kind === 'MF' ? Math.floor(u * 1000) / 1000 : Math.floor(u))

/** Units allotted for an amount: MF deducts stamp duty, stocks/ETFs buy whole shares. */
export function unitsFor(amount: number, price: number, inst: Instrument, r: TaxRules, charges = 0) {
  if (inst.kind === 'MF') {
    const net = amount * (1 - r.stamp_duty / 100)
    const units = roundUnits(net / price, 'MF')
    return { units, amount }
  }
  const units = Math.floor(Math.max(0, amount - charges) / price)
  return { units, amount: Math.round(units * price * 100) / 100 }
}

export interface SipRun {
  newTxns: Omit<Txn, 'id'>[]
  sipUpdates: { id: string; last_run_date: string }[]
}

/**
 * Turn due SIP instalments into buy transactions using the NAV/close of the due date,
 * or the next working day if the market/AMFI had no price that day (like Groww).
 */
export function runSips(sips: Sip[], instruments: Instrument[], book: PriceBook, today: string, r: TaxRules): SipRun {
  const inst = new Map(instruments.map((i) => [i.id, i]))
  const res: SipRun = { newTxns: [], sipUpdates: [] }
  for (const s of sips) {
    if (!s.active) continue
    const i = inst.get(s.instrument_id)
    if (!i) continue
    let last = s.last_run_date ?? null
    for (const due of dueDates(s, last, today)) {
      const p = book.onOrAfter(priceKey(i), due, today)
      // Don't allot from a stale price more than 7 days after due date (data gap) — wait instead.
      if (!p || p.date > addDays(due, 7)) break
      const { units, amount } = unitsFor(s.amount, p.price, i, r, Number(s.charges ?? 0))
      if (units > 0)
        res.newTxns.push({
          holder_id: s.holder_id,
          instrument_id: s.instrument_id,
          date: p.date,
          type: 'BUY',
          units,
          price: p.price,
          amount,
          status: 'done',
          source: 'sip',
          sip_id: s.id,
          note: `SIP instalment due ${due}`,
        })
      last = due
    }
    if (last && last !== s.last_run_date) res.sipUpdates.push({ id: s.id, last_run_date: last })
  }
  return res
}

/** Fill pending lumpsum buys / withdrawals once the price for their date is published. */
export function fillPending(txns: Txn[], instruments: Instrument[], book: PriceBook, today: string, r: TaxRules) {
  const inst = new Map(instruments.map((i) => [i.id, i]))
  const updates: { id: string; patch: Partial<Txn> }[] = []
  for (const t of txns) {
    if (t.status !== 'pending') continue
    const i = inst.get(t.instrument_id)
    if (!i) continue
    const from = t.after_cutoff ? addDays(t.date, 1) : t.date
    const p = book.onOrAfter(priceKey(i), from, today)
    if (!p) continue
    if (t.type === 'BUY') {
      const { units, amount } = unitsFor(t.amount ?? 0, p.price, i, r)
      updates.push({ id: t.id, patch: { status: 'done', date: p.date, price: p.price, units, amount } })
    } else {
      const units = t.units ?? roundUnits((t.amount ?? 0) / p.price, i.kind)
      updates.push({ id: t.id, patch: { status: 'done', date: p.date, price: p.price, units, amount: units * p.price } })
    }
  }
  return updates
}
