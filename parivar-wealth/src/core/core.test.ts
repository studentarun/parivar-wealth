import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES as R } from './rules'
import { addMonths, fyOf, toISODate } from './dates'
import { buildPositions, ltDate, simulateSell } from './lots'
import { computeTax, ZERO } from './tax'
import { dueDates, runSips, fillPending, unitsFor } from './sip'
import { PriceBook } from './prices'
import type { Instrument, Sip, Txn } from './types'
import { harvestPlan } from './advice'
import { valueHoldings, xirr } from './valuation'
import { personYears } from './tax'

const mf: Instrument = { id: 'i1', kind: 'MF', code: '100', name: 'Test Flexi', tax_class: 'equity', category: 'Flexi/Multi', exit_load_pct: 1, exit_load_days: 365, keep: true }
const t = (p: Partial<Txn>): Txn => ({ id: Math.random().toString(36), holder_id: 'h1', instrument_id: 'i1', date: '2024-01-01', type: 'BUY', units: 10, price: 100, amount: 1000, status: 'done', source: 'manual', ...p })

describe('dates', () => {
  it('addMonths clips', () => expect(addMonths('2025-01-31', 1)).toBe('2025-02-28'))
  it('fy', () => expect(fyOf('2027-03-31')).toBe(2026))
  it('parses', () => expect(toISODate('23-Nov-2026')).toBe('2026-11-23'))
})

describe('term', () => {
  it('equity LT after 12 months', () => expect(ltDate('2025-01-15', 'equity', R)).toBe('2026-01-16'))
  it('intl FoF bought in specified window is always slab', () => expect(ltDate('2024-06-01', 'intl_fof', R)).toBeNull())
  it('intl FoF after window: 24 months', () => expect(ltDate('2025-06-01', 'intl_fof', R)).toBe('2027-06-02'))
})

describe('FIFO', () => {
  it('sells oldest first and splits LT/ST', () => {
    const pos = buildPositions(
      [t({ date: '2024-01-01', units: 10, amount: 1000 }), t({ date: '2026-06-01', units: 10, amount: 1500 }), t({ type: 'SELL', date: '2026-11-20', units: 15, price: 200, amount: 3000 })],
      [mf],
      R,
    )[0]
    expect(pos.realised.length).toBe(2)
    expect(pos.realised[0].term).toBe('LT')
    expect(pos.realised[0].gain).toBeCloseTo(1000)
    expect(pos.realised[1].term).toBe('ST')
    expect(pos.realised[1].gain).toBeCloseTo(250)
    expect(pos.lots[0].units).toBeCloseTo(5)
    const sim = simulateSell(pos, 5, 200, '2026-11-25', R)
    expect(sim[0].exit_load).toBeCloseTo(10) // held < 365 days → 1%
  })
})

describe('tax', () => {
  it('LTCG within 1.25L is free for zero-income person', () => expect(computeTax(0, { ...ZERO, eqLT: 120000 }, R).total).toBe(0))
  it('LTCG above limit for 30% slab person', () => {
    const base = computeTax(2500000, ZERO, R).total
    const withG = computeTax(2500000, { ...ZERO, eqLT: 225000 }, R).total
    expect(withG - base).toBeCloseTo(100000 * 0.125 * 1.04)
  })
  it('unused basic exemption covers gains', () => expect(computeTax(100000, { ...ZERO, eqLT: 125000 + 300000 }, R).total).toBe(0))
  it('ST loss sets off LT gain', () => expect(computeTax(2500000, { ...ZERO, eqLT: 200000, eqST: -75000 }, R).total).toBeCloseTo(computeTax(2500000, ZERO, R).total))
})

describe('SIP', () => {
  const sip: Sip = { id: 's1', holder_id: 'h1', instrument_id: 'i1', amount: 5000, day: 5, start_date: '2026-09-01', active: true, last_run_date: null }
  it('due dates', () => expect(dueDates(sip, null, '2026-11-25')).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']))
  it('uses next working day NAV and stamp duty', () => {
    const book = new PriceBook([
      { key: 'MF:100', date: '2026-09-04', price: 50 },
      { key: 'MF:100', date: '2026-09-07', price: 51 }, // 5th & 6th weekend
      { key: 'MF:100', date: '2026-10-05', price: 52 },
    ])
    const run = runSips([sip], [mf], book, '2026-11-25', R)
    expect(run.newTxns.length).toBe(2) // Nov NAV not available yet → waits
    expect(run.newTxns[0].date).toBe('2026-09-07')
    expect(run.newTxns[0].units).toBeCloseTo(Math.floor(((5000 * 0.99995) / 51) * 1000) / 1000)
    expect(run.sipUpdates[0].last_run_date).toBe('2026-10-05')
  })
  it('fills pending after cut-off with next NAV', () => {
    const book = new PriceBook([{ key: 'MF:100', date: '2026-11-24', price: 10 }, { key: 'MF:100', date: '2026-11-25', price: 11 }])
    const u = fillPending([t({ status: 'pending', date: '2026-11-24', units: null, price: null, amount: 1100, after_cutoff: true })], [mf], book, '2026-11-25', R)
    expect(u[0].patch.price).toBe(11)
  })
})

describe('harvest', () => {
  it('fills up to the limit, oldest first', () => {
    const txns = [t({ date: '2020-01-01', units: 1000, amount: 10000 }), t({ date: '2021-01-01', units: 1000, amount: 10000 })]
    const pos = buildPositions(txns, [mf], R)
    const book = new PriceBook([{ key: 'MF:100', date: '2026-11-24', price: 110 }]) // gain 100/unit
    const hs = valueHoldings(pos, book, '2026-11-25', R)
    const ys = personYears(pos, [{ id: 'h1', name: 'A', other_income: 2000000 }], 2026, R)
    const p = harvestPlan(ys[0], hs, R, '2026-11-25')
    expect(p.total).toBeLessThanOrEqual(R.ltcg_exemption - R.harvest_buffer + 1)
    expect(p.total).toBeGreaterThan(120000)
    expect(p.rows[0].units).toBeCloseTo(1000 + 230, 0)
  })
  it('xirr ~10%', () => expect(xirr([{ date: '2025-01-01', amount: -100 }, { date: '2026-01-01', amount: 110 }])!).toBeCloseTo(0.1, 2))
})

describe('ETF SIP by amount (whole units, charges kept aside)', () => {
  it('matches Groww-style varying amounts', () => {
    const etf: Instrument = { ...mf, id: 'e', kind: 'ETF', code: 'GOLDBEES', tax_class: 'listed_nonequity' }
    expect(unitsFor(5000, 124.1, etf, R, 70).units).toBe(39)
    expect(unitsFor(5000, 120.09, etf, R, 70).units).toBe(41)
  })
})

import { taxableIncome } from './income'
describe('income → taxable income', () => {
  it('pensioner with 6L pension pays no tax in new regime', () => {
    const t = taxableIncome({ pension: 600000 }, { regime: 'new', age_group: '60to79' }, R)
    expect(t.taxable).toBe(525000)
    expect(t.tax).toBe(0)
  })
  it('rent 3L → 2.1L taxable, no tax', () => {
    const t = taxableIncome({ rent: 300000 }, { regime: 'new' }, R)
    expect(t.taxable).toBe(210000)
    expect(t.tax).toBe(0)
  })
  it('old regime with 80C', () => {
    const t = taxableIncome({ salary: 1500000, deductions: 150000 }, { regime: 'old', age_group: 'below60' }, R)
    expect(t.taxable).toBe(1300000)
    // 12,500 + 1,00,000 + 90,000 = 2,02,500 + 4% cess
    expect(t.tax).toBe(Math.round(202500 * 1.04))
  })
})
