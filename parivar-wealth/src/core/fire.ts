// FIRE (Financial Independence, Retire Early) maths — all amounts in rupees, yearly steps.

export interface Goal {
  id: string
  name: string
  amount: number // in today's rupees
  year: number
  inflation?: number // % per year, default plan inflation
}

export interface FirePlan {
  age: number
  retireAge: number
  lifeAge: number
  monthlyExpense: number // household, today's rupees
  retireExpensePct: number // spending in retirement as % of today's (e.g. 90)
  inflation: number // %
  preReturn: number // % before retirement
  postReturn: number // % after retirement
  sipMonthly: number // current monthly investing
  sipStepUp: number // % yearly increase
  passiveMonthly: number // rent / pension in retirement, today's rupees
  passiveGrowth: number // % per year
  goals: Goal[]
}

export interface FireYear {
  year: number
  age: number
  corpus: number
  need: number // corpus needed if retiring this year
  phase: 'work' | 'retired'
  goal: number
}

const pv = (rate: number) => 1 + rate / 100

/** Corpus needed at the start of retirement to fund expenses (net of passive income) till lifeAge, + later goals. */
export function corpusNeeded(p: FirePlan, retireAge: number, thisYear: number): number {
  const yrs = retireAge - p.age
  const yearsInRetirement = Math.max(1, p.lifeAge - retireAge)
  const expense0 = p.monthlyExpense * 12 * (p.retireExpensePct / 100) * Math.pow(pv(p.inflation), yrs)
  const passive0 = p.passiveMonthly * 12 * Math.pow(pv(p.passiveGrowth), yrs)
  let need = 0
  for (let k = 0; k < yearsInRetirement; k++) {
    const net = Math.max(0, expense0 * Math.pow(pv(p.inflation), k) - passive0 * Math.pow(pv(p.passiveGrowth), k))
    need += net / Math.pow(pv(p.postReturn), k) // withdrawn at the start of each year
  }
  const retireYear = thisYear + yrs
  for (const g of p.goals) {
    if (g.year < retireYear) continue
    const nominal = g.amount * Math.pow(pv(g.inflation ?? p.inflation), g.year - thisYear)
    need += nominal / Math.pow(pv(p.postReturn), g.year - retireYear)
  }
  return need
}

/** Year-by-year path: invest until retireAge, then withdraw. */
export function simulate(p: FirePlan, corpus0: number, thisYear: number, retireAge = p.retireAge, sipMonthly = p.sipMonthly): FireYear[] {
  const out: FireYear[] = []
  let c = corpus0
  const yrsToRetire = retireAge - p.age
  for (let t = 0; p.age + t <= p.lifeAge; t++) {
    const year = thisYear + t
    const age = p.age + t
    const working = age < retireAge
    const goal = p.goals.filter((g) => g.year === year).reduce((s, g) => s + g.amount * Math.pow(pv(g.inflation ?? p.inflation), t), 0)
    out.push({ year, age, corpus: c, need: working ? corpusNeeded(p, age, thisYear) : 0, phase: working ? 'work' : 'retired', goal })
    if (working) {
      const sip = sipMonthly * 12 * Math.pow(pv(p.sipStepUp), t)
      c = (c - goal) * pv(p.preReturn) + sip * Math.sqrt(pv(p.preReturn)) // SIP spread through the year
    } else {
      const k = age - retireAge
      const expense = p.monthlyExpense * 12 * (p.retireExpensePct / 100) * Math.pow(pv(p.inflation), yrsToRetire + k)
      const passive = p.passiveMonthly * 12 * Math.pow(pv(p.passiveGrowth), yrsToRetire + k)
      c = (c - goal - Math.max(0, expense - passive)) * pv(p.postReturn)
    }
  }
  return out
}

export function corpusAt(p: FirePlan, corpus0: number, thisYear: number, retireAge: number, sipMonthly = p.sipMonthly) {
  const path = simulate(p, corpus0, thisYear, retireAge, sipMonthly)
  return path.find((y) => y.age === retireAge)?.corpus ?? 0
}

/** Earliest age at which the projected corpus covers what's needed. */
export function earliestRetireAge(p: FirePlan, corpus0: number, thisYear: number): number | null {
  for (let a = p.age; a <= Math.min(75, p.lifeAge - 1); a++) {
    if (corpusAt(p, corpus0, thisYear, a) >= corpusNeeded(p, a, thisYear)) return a
  }
  return null
}

/** Monthly SIP (today, stepping up yearly) needed to retire at the planned age. */
export function sipNeeded(p: FirePlan, corpus0: number, thisYear: number): number {
  const need = corpusNeeded(p, p.retireAge, thisYear)
  if (corpusAt(p, corpus0, thisYear, p.retireAge, 0) >= need) return 0
  let lo = 0
  let hi = 5_000_000
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (corpusAt(p, corpus0, thisYear, p.retireAge, mid) >= need) hi = mid
    else lo = mid
  }
  return hi
}

/** Does the money last till lifeAge when retiring at the planned age? */
export function lastsTill(p: FirePlan, corpus0: number, thisYear: number): number | null {
  const path = simulate(p, corpus0, thisYear)
  const broke = path.find((y) => y.phase === 'retired' && y.corpus < 0)
  return broke ? broke.age : null
}
