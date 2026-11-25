import { addDays, addMonths } from './dates'
import type { Instrument, TaxClass, TaxRules, Txn } from './types'

export interface Lot {
  txn_id: string
  date: string
  units: number
  cost_per_unit: number
}

export interface Realised {
  holder_id: string
  instrument_id: string
  sell_txn_id: string
  sell_date: string
  buy_date: string
  units: number
  cost: number
  proceeds: number
  gain: number
  term: 'LT' | 'ST'
  slab: boolean // taxed at slab rate (non-equity short-term, debt, specified MF)
  tax_class: TaxClass
}

export interface Position {
  holder_id: string
  instrument: Instrument
  lots: Lot[]
  realised: Realised[]
  txns: Txn[]
}

/** Date on which units bought on `buy` become long-term for this tax class. */
export function ltDate(buy: string, tc: TaxClass, r: TaxRules): string | null {
  if (tc === 'debt') return null
  if (tc === 'intl_fof' && buy >= r.specified_window_from && buy <= r.specified_window_to) return null
  const months =
    tc === 'equity' || tc === 'equity_elss'
      ? r.equity_lt_months
      : tc === 'listed_nonequity'
        ? r.nonequity_listed_lt_months
        : r.nonequity_unlisted_lt_months
  return addDays(addMonths(buy, months), 1)
}

export function termOf(buy: string, sell: string, tc: TaxClass, r: TaxRules): { term: 'LT' | 'ST'; slab: boolean } {
  const lt = ltDate(buy, tc, r)
  const isLT = lt != null && sell >= lt
  const isEquity = tc === 'equity' || tc === 'equity_elss'
  return { term: isLT ? 'LT' : 'ST', slab: !isLT && !isEquity }
}

export function unlockDate(buy: string, tc: TaxClass, r: TaxRules): string | null {
  return tc === 'equity_elss' ? addMonths(buy, r.elss_lock_months) : null
}

const EPS = 1e-6

/** Build FIFO lots and realised gains per (holder, instrument). Only 'done' transactions count. */
export function buildPositions(txns: Txn[], instruments: Instrument[], rules: TaxRules): Position[] {
  const instById = new Map(instruments.map((i) => [i.id, i]))
  const groups = new Map<string, Txn[]>()
  for (const t of txns) {
    const k = `${t.holder_id}|${t.instrument_id}`
    let g = groups.get(k)
    if (!g) groups.set(k, (g = []))
    g.push(t)
  }
  const out: Position[] = []
  for (const [k, list] of groups) {
    const [holder_id, instrument_id] = k.split('|')
    const inst = instById.get(instrument_id)
    if (!inst) continue
    const sorted = [...list].sort(
      (a, b) => a.date.localeCompare(b.date) || (a.type === b.type ? 0 : a.type === 'BUY' ? -1 : 1),
    )
    const lots: Lot[] = []
    const realised: Realised[] = []
    for (const t of sorted) {
      if (t.status !== 'done' || !t.units || t.units <= 0) continue
      if (t.type === 'BUY') {
        const cost = t.amount && t.amount > 0 ? t.amount : t.units * (t.price ?? 0)
        lots.push({ txn_id: t.id, date: t.date, units: t.units, cost_per_unit: cost / t.units })
      } else {
        let left = t.units
        const sellPrice = t.price ?? 0
        while (left > EPS && lots.length) {
          const lot = lots[0]
          const u = Math.min(lot.units, left)
          const { term, slab } = termOf(lot.date, t.date, inst.tax_class, rules)
          realised.push({
            holder_id,
            instrument_id,
            sell_txn_id: t.id,
            sell_date: t.date,
            buy_date: lot.date,
            units: u,
            cost: u * lot.cost_per_unit,
            proceeds: u * sellPrice,
            gain: u * (sellPrice - lot.cost_per_unit),
            term,
            slab,
            tax_class: inst.tax_class,
          })
          lot.units -= u
          left -= u
          if (lot.units <= EPS) lots.shift()
        }
      }
    }
    out.push({ holder_id, instrument: inst, lots, realised, txns: sorted })
  }
  return out
}

export const unitsOf = (p: Position) => p.lots.reduce((s, l) => s + l.units, 0)
export const costOf = (p: Position) => p.lots.reduce((s, l) => s + l.units * l.cost_per_unit, 0)

/** Simulate selling `units` FIFO at `price` on `date` — returns the realised pieces without changing anything. */
export function simulateSell(p: Position, units: number, price: number, date: string, rules: TaxRules) {
  let left = units
  const pieces: (Realised & { exit_load: number; locked: boolean })[] = []
  for (const lot of p.lots) {
    if (left <= EPS) break
    const u = Math.min(lot.units, left)
    const { term, slab } = termOf(lot.date, date, p.instrument.tax_class, rules)
    const held = (Date.parse(date) - Date.parse(lot.date)) / 86400000
    const exit_load = held < p.instrument.exit_load_days ? (u * price * p.instrument.exit_load_pct) / 100 : 0
    const unlock = unlockDate(lot.date, p.instrument.tax_class, rules)
    pieces.push({
      holder_id: p.holder_id,
      instrument_id: p.instrument.id,
      sell_txn_id: 'preview',
      sell_date: date,
      buy_date: lot.date,
      units: u,
      cost: u * lot.cost_per_unit,
      proceeds: u * price - exit_load,
      gain: u * price - exit_load - u * lot.cost_per_unit,
      term,
      slab,
      tax_class: p.instrument.tax_class,
      exit_load,
      locked: unlock != null && date < unlock,
    })
    left -= u
  }
  return pieces
}
