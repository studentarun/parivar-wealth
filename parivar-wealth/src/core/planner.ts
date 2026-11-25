// "I have money to invest" planner. Rules-based: fills the gaps between the family's current mix
// and a target mix chosen from the answers. It only suggests CATEGORIES and the family's own
// existing funds — it never picks a new fund or stock for you.
import type { InvestRank } from './advice'
import type { Category, Holder } from './types'
import type { Holding } from './valuation'

export type Horizon = 'lt1' | '1to3' | '3to7' | '7plus'
export type Risk = 'steady' | 'balanced' | 'aggressive'

export interface PlanAnswers {
  amount: number
  mode: 'sip' | 'once'
  horizon: Horizon
  risk: Risk
  who: 'auto' | string // holder id
  international: boolean
  gold: boolean
  themes: boolean
  stocks: boolean
  emergencyReady: boolean
  spreadMonths: 0 | 3 | 6
}

export type PlanCat = Category | 'Liquid/FD'

/** Target mix by horizon and comfort with ups and downs (percent of the family's investments). */
export function targetMix(a: Pick<PlanAnswers, 'horizon' | 'risk' | 'international' | 'gold' | 'themes' | 'stocks'>): Partial<Record<PlanCat, number>> {
  if (a.horizon === 'lt1') return { 'Liquid/FD': 100 }
  if (a.horizon === '1to3') return { 'Liquid/FD': 60, Debt: 40 }
  const base: Record<Risk, Partial<Record<PlanCat, number>>> =
    a.horizon === '3to7'
      ? {
          steady: { 'Large/Index': 35, 'Flexi/Multi': 20, Debt: 30, International: 10, 'Gold/Silver': 5 },
          balanced: { 'Large/Index': 35, 'Flexi/Multi': 25, Mid: 10, Debt: 15, International: 10, 'Gold/Silver': 5 },
          aggressive: { 'Large/Index': 30, 'Flexi/Multi': 25, Mid: 15, Small: 5, Debt: 10, International: 10, 'Gold/Silver': 5 },
        }
      : {
          steady: { 'Large/Index': 40, 'Flexi/Multi': 25, Mid: 10, Small: 5, International: 15, 'Gold/Silver': 5 },
          balanced: { 'Large/Index': 30, 'Flexi/Multi': 25, Mid: 15, Small: 10, International: 15, 'Gold/Silver': 5 },
          aggressive: { 'Large/Index': 25, 'Flexi/Multi': 20, Mid: 20, Small: 15, International: 15, 'Gold/Silver': 5 },
        }
  const mix = { ...base[a.risk] }
  const move = (from: PlanCat, to: PlanCat, pct?: number) => {
    const v = pct ?? mix[from] ?? 0
    mix[from] = (mix[from] ?? 0) - v
    mix[to] = (mix[to] ?? 0) + v
    if (!mix[from]) delete mix[from]
  }
  if (!a.international) move('International', 'Large/Index')
  if (!a.gold) move('Gold/Silver', 'Large/Index')
  if (a.themes && a.risk !== 'steady') move('Flexi/Multi', 'Sector/Theme', 5)
  if (a.stocks && a.risk !== 'steady') move('Large/Index', 'Stocks', 5)
  return mix
}

export interface PlanRow {
  category: PlanCat
  amount: number
  holder_id: string | null
  instrument_id: string | null // existing fund to top up
  fundName: string | null
  search: string // search hint for choosing a new fund
  reason: string
  taxNote: string
}

export interface PlanResult {
  rows: PlanRow[]
  current: { cat: PlanCat; value: number; share: number }[]
  target: Partial<Record<PlanCat, number>>
  warnings: string[]
  notes: string[]
}

const SEARCH: Record<PlanCat, string> = {
  'Liquid/FD': 'liquid',
  Debt: 'short duration',
  'Large/Index': 'nifty 50 index',
  'Flexi/Multi': 'flexi cap',
  Mid: 'midcap 150',
  Small: 'smallcap 250',
  International: 'S&P 500',
  'Gold/Silver': 'gold',
  'Sector/Theme': '',
  ELSS: '',
  Stocks: '',
  Other: '',
}

const CRITERIA: Partial<Record<PlanCat, string>> = {
  'Liquid/FD': 'a liquid fund (Direct, Growth) or a bank FD — safe, easy to withdraw',
  Debt: 'a short-duration / corporate-bond fund (Direct, Growth) or FD',
  'Large/Index': 'a Nifty 50 / Sensex index fund (Direct, Growth) with low expense ratio (<0.3%)',
  'Flexi/Multi': 'one well-run flexi-cap fund (Direct, Growth)',
  Mid: 'a Nifty Midcap 150 index fund or one midcap fund (Direct, Growth)',
  Small: 'a Nifty Smallcap 250 index fund or one small-cap fund (Direct, Growth)',
  International: 'an S&P 500 / Nasdaq 100 / global fund-of-fund (Direct, Growth) that is currently accepting SIPs',
  'Gold/Silver': 'a gold ETF fund-of-fund (Direct, Growth) or a gold ETF',
  'Sector/Theme': 'only if you have a strong view; keep small',
  Stocks: 'your own research — keep it small',
}

const round = (v: number, step: number) => Math.round(v / step) * step

export function planInvestment(
  a: PlanAnswers,
  holdings: Holding[],
  holders: Holder[],
  where: { equity: InvestRank[]; other: InvestRank[] },
): PlanResult {
  const warnings: string[] = []
  const notes: string[] = []
  const totalNow = holdings.reduce((s, h) => s + h.value, 0)

  // current mix (ELSS counts as flexi-ish equity; FD/liquid tracked later in phase 2)
  const cur = new Map<PlanCat, number>()
  for (const h of holdings) {
    const c: PlanCat = h.category === 'ELSS' ? 'Flexi/Multi' : h.category
    cur.set(c, (cur.get(c) ?? 0) + h.value)
  }
  const current = [...cur.entries()].map(([cat, value]) => ({ cat, value, share: totalNow ? value / totalNow : 0 })).sort((x, y) => y.value - x.value)

  if (!a.emergencyReady) warnings.push('First keep 6 months of expenses as an emergency fund (savings/FD/liquid fund). Investing it in equity can force you to sell at a loss.')

  let target = targetMix(a)
  const short = a.horizon === 'lt1' || a.horizon === '1to3'
  if (short) {
    notes.push('Money needed within 3 years should not go into equity — markets can fall 30% and take years to recover. This money is planned separately from your long-term mix.')
  }

  // Gap filling: what the mix should look like after adding this money (for SIP: one year of instalments)
  const yearMoney = a.mode === 'sip' ? a.amount * 12 : a.amount
  const alloc = new Map<PlanCat, number>()
  if (short) {
    for (const [c, p] of Object.entries(target) as [PlanCat, number][]) alloc.set(c, (yearMoney * p) / 100)
  } else {
    const after = totalNow + yearMoney
    let deficitTotal = 0
    const deficits = new Map<PlanCat, number>()
    for (const [c, p] of Object.entries(target) as [PlanCat, number][]) {
      const d = Math.max(0, (after * p) / 100 - (cur.get(c) ?? 0))
      deficits.set(c, d)
      deficitTotal += d
    }
    if (deficitTotal > 0) for (const [c, d] of deficits) alloc.set(c, (yearMoney * d) / deficitTotal)
    else for (const [c, p] of Object.entries(target) as [PlanCat, number][]) alloc.set(c, (yearMoney * p) / 100)
    // over-weight categories get nothing new
    const over = current.filter((x) => {
      const t = (target[x.cat] ?? 0) / 100
      return x.share > t + 0.05
    })
    if (over.length)
      notes.push(
        `Already more than planned in ${over.map((o) => `${o.cat} (${Math.round(o.share * 100)}% vs ${target[o.cat] ?? 0}%)`).join(', ')} — so no new money goes there. Rebalance slowly using tax-free profit booking.`,
      )
  }

  // back to the per-instalment amount, rounded; drop tiny slices
  const div = a.mode === 'sip' ? 12 : 1
  const step = a.mode === 'sip' ? 500 : 1000
  const min = a.mode === 'sip' ? 500 : 2000
  let slices = [...alloc.entries()].map(([c, v]) => ({ c, v: v / div })).filter((x) => x.v > 0)
  slices.sort((x, y) => y.v - x.v)
  const kept: { c: PlanCat; v: number }[] = []
  let leftover = 0
  for (const s of slices) {
    if (s.v < min) leftover += s.v
    else kept.push({ ...s })
  }
  if (!kept.length && slices.length) kept.push({ c: slices[0].c, v: 0 })
  if (kept.length) kept[0].v += leftover
  // limit to 4 slices — fewer funds is better
  if (kept.length > 4) {
    const extra = kept.splice(4).reduce((s, x) => s + x.v, 0)
    kept[0].v += extra
    notes.push('Kept to 4 investments at most — fewer funds are easier to track and overlap less.')
  }
  let rounded = kept.map((k) => ({ c: k.c, v: round(k.v, step) }))
  const diff = a.amount - rounded.reduce((s, x) => s + x.v, 0)
  if (rounded.length) rounded[0].v += diff
  rounded = rounded.filter((r) => r.v > 0)

  // choose account + fund for each slice
  const rows: PlanRow[] = rounded.map(({ c, v }) => {
    const isEquity = !['Liquid/FD', 'Debt', 'International', 'Gold/Silver'].includes(c)
    const ranking = isEquity ? where.equity : where.other
    const person = a.who !== 'auto' ? holders.find((h) => h.id === a.who) : ranking[0]?.person
    const holderId = person?.id ?? null
    // the family's biggest kept fund in this category (index funds preferred for large-cap) — fewer funds, less overlap
    const famValue = new Map<string, { h: Holding; v: number }>()
    for (const h of holdings) {
      const i = h.pos.instrument
      if (h.category !== c || !i.keep || i.kind === 'STOCK' || i.tax_class === 'equity_elss') continue
      const e = famValue.get(i.id) ?? { h, v: 0 }
      e.v += h.value
      famValue.set(i.id, e)
    }
    const isIndex = (n: string) => /index|nifty|sensex|bees/i.test(n)
    const candidates = [...famValue.values()]
      .sort((x, y) => (c === 'Large/Index' ? Number(isIndex(y.h.pos.instrument.name)) - Number(isIndex(x.h.pos.instrument.name)) : 0) || y.v - x.v)
      .map((x) => x.h)
    const pick = c === 'Stocks' || c === 'Liquid/FD' ? undefined : candidates[0]
    const taxNote = isEquity
      ? 'Equity: tax-free up to ₹1.25L profit/yr per person after 1 year; then 12.5%.'
      : c === 'International'
        ? 'International fund-of-fund: 12.5% after 2 years (no ₹1.25L limit); slab rate before that.'
        : c === 'Gold/Silver'
          ? 'Gold fund-of-fund: 12.5% after 2 years (ETF: after 1 year); slab rate before.'
          : 'Interest / debt-fund gains are taxed at the slab rate every year — best in the lowest-income account.'
    const whoReason =
      a.who !== 'auto'
        ? ''
        : ranking[0]
          ? ` Account: ${ranking[0].person.name} — ${isEquity ? 'least unbooked profit already queued against the yearly tax-free limit' : 'lowest income, so lowest tax on this type'}.`
          : ''
    return {
      category: c,
      amount: v,
      holder_id: holderId,
      instrument_id: pick?.pos.instrument.id ?? null,
      fundName: pick?.pos.instrument.name ?? null,
      search: SEARCH[c],
      reason: (pick
        ? `Top up ${pick.pos.instrument.name} — the family already holds it and is keeping it${c === 'Large/Index' && isIndex(pick.pos.instrument.name) ? ' (low-cost index fund)' : ''}.`
        : `New: choose ${CRITERIA[c] ?? 'a suitable fund'}.`) + whoReason,
      taxNote,
    }
  })

  if (a.mode === 'once' && !short && a.spreadMonths)
    notes.push(`Spread the lumpsum over ${a.spreadMonths} months (≈ ₹${Math.round(a.amount / a.spreadMonths).toLocaleString('en-IN')}/month) — park it in a liquid fund and move it in monthly. This avoids putting everything in on a bad day.`)
  if (a.mode === 'once' && !short && !a.spreadMonths && a.amount >= 300000)
    notes.push('For a large lumpsum, spreading it over 3–6 months lowers the risk of buying just before a fall.')
  if (a.who === 'auto' && holders.length > 1 && holders.every((h) => !h.other_income))
    warnings.push("Everyone's yearly income is set to ₹0, so the account choice is a guess. Enter incomes in More → Family for a real tax-smart pick.")
  if (a.stocks) notes.push('Direct stocks: the planner keeps them to a small share and does not pick stocks.')

  return { rows, current, target, warnings, notes }
}
