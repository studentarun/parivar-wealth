import { describe, expect, it } from 'vitest'
import { corpusNeeded, earliestRetireAge, sipNeeded, corpusAt, type FirePlan } from './fire'
const P: FirePlan = { age: 35, retireAge: 50, lifeAge: 85, monthlyExpense: 50000, retireExpensePct: 100, inflation: 6, preReturn: 11, postReturn: 8, sipMonthly: 50000, sipStepUp: 10, passiveMonthly: 0, passiveGrowth: 5, goals: [] }
describe('fire', () => {
  it('zero real return → need = expenses × years', () => {
    const p = { ...P, inflation: 0, postReturn: 0, age: 50 }
    expect(corpusNeeded(p, 50, 2026)).toBeCloseTo(600000 * 35)
  })
  it('passive income lowers the need', () => {
    expect(corpusNeeded({ ...P, passiveMonthly: 20000 }, 50, 2026)).toBeLessThan(corpusNeeded(P, 50, 2026))
  })
  it('sip needed hits the target', () => {
    const s = sipNeeded(P, 2000000, 2026)
    expect(corpusAt(P, 2000000, 2026, 50, s)).toBeGreaterThanOrEqual(corpusNeeded(P, 50, 2026) - 1)
    expect(corpusAt(P, 2000000, 2026, 50, s * 0.95)).toBeLessThan(corpusNeeded(P, 50, 2026))
  })
  it('earliest age moves later with a big goal', () => {
    const a = earliestRetireAge(P, 2000000, 2026)!
    const b = earliestRetireAge({ ...P, goals: [{ id: 'g', name: 'house', amount: 4000000, year: 2029 }] }, 2000000, 2026)!
    expect(b).toBeGreaterThanOrEqual(a)
  })
})
