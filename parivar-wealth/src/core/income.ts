import { computeTax, ZERO } from './tax'
import type { Holder, IncomeSources, TaxRules } from './types'

/** Taxable income from gross income by source, for the chosen regime. */
export function taxableIncome(inc: IncomeSources | null | undefined, h: Pick<Holder, 'regime' | 'age_group'>, r: TaxRules) {
  const i = inc ?? {}
  const old = h.regime === 'old'
  const senior = h.age_group === '60to79' || h.age_group === '80plus'
  const salaryPension = (i.salary ?? 0) + (i.pension ?? 0)
  const std = Math.min(salaryPension, old ? r.std_deduction_old : r.std_deduction_new)
  const rentTaxable = (i.rent ?? 0) * 0.7 // 30% standard deduction on rent (house property)
  let interest = i.interest ?? 0
  let interestDed = 0
  if (old) interestDed = Math.min(interest, senior ? 50000 : 10000) // 80TTB / 80TTA (80TTA is savings-account interest only)
  interest -= interestDed
  const deductions = old ? Math.min(i.deductions ?? 0, Math.max(0, salaryPension - std + rentTaxable + interest + (i.other ?? 0))) : 0
  const taxable = Math.max(0, salaryPension - std + rentTaxable + interest + (i.other ?? 0) - deductions)
  const lines = [
    salaryPension ? `Salary/pension ₹${fmt(salaryPension)} − standard deduction ₹${fmt(std)}` : '',
    i.rent ? `Rent ₹${fmt(i.rent)} − 30% standard deduction = ₹${fmt(rentTaxable)}` : '',
    i.interest ? `Interest ₹${fmt(i.interest)}${interestDed ? ` − ₹${fmt(interestDed)} (${senior ? '80TTB' : '80TTA'})` : ''}` : '',
    i.other ? `Other ₹${fmt(i.other)}` : '',
    deductions ? `Deductions (80C/80D…) − ₹${fmt(deductions)}` : '',
  ].filter(Boolean)
  const tax = computeTax(taxable, ZERO, r, h).total
  return { taxable: Math.round(taxable), tax: Math.round(tax), lines }
}
const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
