import { describe, expect, it } from 'vitest'
import { planInvestment, targetMix } from './planner'
import type { Holding } from './valuation'

const h = (cat: string, value: number, name: string, holder = 'a'): Holding =>
  ({ pos: { holder_id: holder, instrument: { id: name, kind: 'MF', code: name, name, category: cat, tax_class: 'equity', keep: true, exit_load_days: 0, exit_load_pct: 0 }, lots: [], realised: [], txns: [] }, units: 1, invested: value, price: 1, priceDate: null, value, gain: 0, ltGain: 0, stGain: 0, xirr: null, category: cat }) as unknown as Holding
const holders = [{ id: 'a', name: 'A', other_income: 0 }]
const where = { equity: [{ person: holders[0], members: holders, score: 0, reason: '' }], other: [{ person: holders[0], members: holders, score: 0, reason: '' }] }
const base = { mode: 'sip', horizon: '7plus', risk: 'balanced', who: 'auto', international: true, gold: true, themes: false, stocks: false, emergencyReady: true, spreadMonths: 0 } as const

describe('planner', () => {
  it('targets sum to 100', () => {
    for (const hz of ['lt1', '1to3', '3to7', '7plus'] as const)
      for (const r of ['steady', 'balanced', 'aggressive'] as const)
        expect(Object.values(targetMix({ ...base, horizon: hz, risk: r })).reduce((s, x) => s + (x ?? 0), 0)).toBe(100)
  })
  it('splits exactly the amount, skips over-weight small caps, tops up existing', () => {
    const hs = [h('Small', 500000, 'S'), h('Large/Index', 20000, 'Nifty 50 Index'), h('Large/Index', 40000, 'Some Large Cap')]
    const r = planInvestment({ ...base, amount: 20000 }, hs, holders, where)
    expect(r.rows.reduce((s, x) => s + x.amount, 0)).toBe(20000)
    expect(r.rows.find((x) => x.category === 'Small')).toBeUndefined()
    expect(r.rows.find((x) => x.category === 'Large/Index')?.fundName).toBe('Nifty 50 Index')
  })
  it('short horizon → no equity', () => {
    const r = planInvestment({ ...base, mode: 'once', amount: 100000, horizon: '1to3' }, [], holders, where)
    expect(r.rows.every((x) => x.category === 'Liquid/FD' || x.category === 'Debt')).toBe(true)
  })
})
