import { fyOf } from './dates'
import type { Position, Realised } from './lots'
import type { AgeGroup, Holder, TaxRules } from './types'

export interface TaxProfile {
  regime?: 'new' | 'old'
  age_group?: AgeGroup
}
type Slabs = { upto: number | null; rate: number }[]

/** Slabs, basic exemption and rebate for a person's regime and age. */
export function regimeOf(r: TaxRules, p?: TaxProfile) {
  if (p?.regime === 'old') {
    const slabs: Slabs = p.age_group === '80plus' ? r.old_slabs_80plus : p.age_group === '60to79' ? r.old_slabs_60to79 : r.old_slabs_below60
    return { slabs, basic: slabs[0].upto ?? 0, rebateLimit: r.old_rebate_income_limit, rebateMax: r.old_rebate_max }
  }
  return { slabs: r.slabs, basic: r.basic_exemption, rebateLimit: r.rebate_income_limit, rebateMax: r.rebate_max }
}

/** Capital gains of one financial year, grouped the way the tax law treats them. */
export interface Gains {
  eqST: number // equity short-term (20%)
  eqLT: number // equity long-term (12.5% above ₹1.25L)
  neLT: number // non-equity long-term (12.5%, no exemption)
  slab: number // taxed at slab rate (non-equity short-term, debt, specified MF)
}

export const ZERO: Gains = { eqST: 0, eqLT: 0, neLT: 0, slab: 0 }
export const addGains = (a: Gains, b: Gains): Gains => ({
  eqST: a.eqST + b.eqST,
  eqLT: a.eqLT + b.eqLT,
  neLT: a.neLT + b.neLT,
  slab: a.slab + b.slab,
})

export function gainsOf(rs: Realised[]): Gains {
  const g = { ...ZERO }
  for (const r of rs) {
    if (r.slab) g.slab += r.gain
    else if (r.term === 'ST') g.eqST += r.gain
    else if (r.tax_class === 'equity' || r.tax_class === 'equity_elss') g.eqLT += r.gain
    else g.neLT += r.gain
  }
  return g
}

/** Losses are set off: short-term loss against any gain, long-term loss only against long-term gain. */
export function setOff(g: Gains): Gains & { carryST: number; carryLT: number } {
  let { eqST, eqLT, neLT, slab } = g
  // short-term losses
  let stLoss = 0
  if (eqST < 0) (stLoss -= eqST), (eqST = 0)
  if (slab < 0) (stLoss -= slab), (slab = 0)
  const take = (v: number) => {
    const t = Math.min(v, stLoss)
    stLoss -= t
    return v - t
  }
  slab = take(slab) // highest-taxed first
  eqST = take(eqST)
  neLT = take(neLT)
  eqLT = take(eqLT)
  // long-term losses
  let ltLoss = 0
  if (eqLT < 0) (ltLoss -= eqLT), (eqLT = 0)
  if (neLT < 0) (ltLoss -= neLT), (neLT = 0)
  const t1 = Math.min(neLT, ltLoss)
  neLT -= t1
  ltLoss -= t1
  const t2 = Math.min(eqLT, ltLoss)
  eqLT -= t2
  ltLoss -= t2
  return { eqST, eqLT, neLT, slab, carryST: stLoss, carryLT: ltLoss }
}

export function slabTax(income: number, r: TaxRules, p?: TaxProfile): number {
  let tax = 0
  let prev = 0
  for (const s of regimeOf(r, p).slabs) {
    const top = s.upto ?? Infinity
    if (income > prev) tax += ((Math.min(income, top) - prev) * s.rate) / 100
    prev = top
  }
  return tax
}

export function marginalRate(income: number, r: TaxRules, p?: TaxProfile): number {
  const slabs = regimeOf(r, p).slabs
  let prev = 0
  for (const s of slabs) {
    const top = s.upto ?? Infinity
    if (income < top) return income >= prev ? s.rate : 0
    prev = top
  }
  return slabs[slabs.length - 1].rate
}

export interface TaxCalc {
  total: number
  exemptionUsed: number
  shortfallUsed: number
  parts: { label: string; amount: number }[]
}

/** Estimated tax for a person for the year (other income + capital gains). Includes cess. */
export function computeTax(otherIncome: number, gIn: Gains, r: TaxRules, prof?: TaxProfile): TaxCalc {
  const rg = regimeOf(r, prof)
  const g = setOff(gIn)
  const normal = Math.max(0, otherIncome + g.slab)
  const nTax = slabTax(normal, r, prof)
  const exemptionUsed = Math.min(g.eqLT, r.ltcg_exemption)
  let eqLT = g.eqLT - exemptionUsed
  let eqST = g.eqST
  let neLT = g.neLT
  let shortfall = Math.max(0, rg.basic - normal)
  const sf0 = shortfall
  const use = (v: number) => {
    const t = Math.min(v, shortfall)
    shortfall -= t
    return v - t
  }
  eqST = use(eqST)
  eqLT = use(eqLT)
  neLT = use(neLT)
  const totalIncome = normal + g.eqST + g.eqLT + g.neLT
  const rebate = totalIncome <= rg.rebateLimit ? Math.min(nTax, rg.rebateMax) : 0
  const sp1 = (eqST * r.equity_st_rate) / 100
  const sp2 = (eqLT * r.equity_lt_rate) / 100
  const sp3 = (neLT * r.nonequity_lt_rate) / 100
  const base = nTax - rebate + sp1 + sp2 + sp3
  const total = base * (1 + r.cess / 100)
  return {
    total,
    exemptionUsed,
    shortfallUsed: sf0 - shortfall,
    parts: [
      { label: 'Tax on income at slab rates (after rebate)', amount: nTax - rebate },
      { label: `Short-term equity gains @${r.equity_st_rate}%`, amount: sp1 },
      { label: `Long-term equity gains above ₹${(r.ltcg_exemption / 1e5).toFixed(2)}L @${r.equity_lt_rate}%`, amount: sp2 },
      { label: `Long-term non-equity gains @${r.nonequity_lt_rate}%`, amount: sp3 },
      { label: `Cess ${r.cess}%`, amount: (base * r.cess) / 100 },
    ],
  }
}

/** The person whose tax return carries this holder's gains (clubbing for spouse-funded accounts). */
export function taxPersonId(holders: Holder[], id: string): string {
  const h = holders.find((x) => x.id === id)
  return h?.clubbed_with || id
}

export interface PersonYear {
  person: Holder
  members: Holder[] // holders whose gains land in this person's return
  gains: Gains
  tax: TaxCalc
  exemptionLeft: number
  shortfallLeft: number
}

export function personYears(positions: Position[], holders: Holder[], fy: number, r: TaxRules): PersonYear[] {
  const out: PersonYear[] = []
  for (const person of holders.filter((h) => !h.clubbed_with)) {
    const members = holders.filter((h) => h.id === person.id || h.clubbed_with === person.id)
    const ids = new Set(members.map((m) => m.id))
    const rs = positions.filter((p) => ids.has(p.holder_id)).flatMap((p) => p.realised.filter((x) => fyOf(x.sell_date) === fy))
    const gains = gainsOf(rs)
    const tax = computeTax(person.other_income, gains, r, person)
    const so = setOff(gains)
    const normal = Math.max(0, person.other_income + so.slab)
    out.push({
      person,
      members,
      gains,
      tax,
      exemptionLeft: Math.max(0, r.ltcg_exemption - so.eqLT),
      shortfallLeft: Math.max(0, regimeOf(r, person).basic - normal - tax.shortfallUsed),
    })
  }
  return out
}

/** Extra tax caused by adding `extra` gains to a person's year. */
export function extraTax(py: PersonYear, extra: Gains, r: TaxRules): number {
  return computeTax(py.person.other_income, addGains(py.gains, extra), r, py.person).total - py.tax.total
}
