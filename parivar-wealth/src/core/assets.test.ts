import { describe, expect, it } from 'vitest'
import { valueAsset, type Asset } from './assets'
const A = (type: Asset['type'], details: Record<string, any>, extra: Partial<Asset> = {}): Asset => ({ id: 'x', holder_id: 'h', type, name: 't', details, active: true, ...extra })
const rates = { date: '2026-11-24', source: 'manual', gold24: 10000, silver: 120 }
describe('assets', () => {
  it('FD cumulative quarterly', () => {
    const v = valueAsset(A('fd', { principal: 100000, rate: 7, start_date: '2025-11-25', maturity_date: '2027-11-25', payout: 'cumulative', compounding: 4 }), '2026-11-25', rates)
    expect(v.value).toBeCloseTo(100000 * Math.pow(1.0175, 4), -2)
    expect(v.future!.value).toBeCloseTo(100000 * Math.pow(1.0175, 8), -2)
  })
  it('22K gold with resale cut', () => {
    const v = valueAsset(A('gold', { grams: 10, purity: '22K', resale_cut_pct: 10 }), '2026-11-25', rates)
    expect(v.value).toBeCloseTo(10 * 0.916 * (10000 / 0.999) * 0.9, 0)
  })
  it('house: land + 2 floors with depreciation, half share', () => {
    const v = valueAsset(A('property', { kind: 'house', area: 100, area_unit: 'sq yd (gaj)', rate_per_unit: 30000, floors: 2, built_sqft_per_floor: 800, construction_rate: 2000, built_year: new Date().getFullYear() - 10, share_pct: 50 }), '2026-11-25', rates)
    expect(v.value).toBeCloseTo((3000000 + 2 * 800 * 2000 * 0.85) / 2, 0)
  })
  it('bigha land', () => {
    const v = valueAsset(A('property', { kind: 'agri', area: 2, area_unit: 'bigha', bigha_sqft: 27000, rate_per_unit: 1500000, income_amount: 60000, income_period: 'year' }), '2026-11-25', rates)
    expect(v.value).toBe(3000000)
    expect(v.income!.yearly).toBe(60000)
  })
  it('loan is negative', () => {
    const v = valueAsset(A('loan', { outstanding: 1500000, rate: 8.5, emi: 25000 }), '2026-11-25', rates)
    expect(v.value).toBe(-1500000)
  })
})
