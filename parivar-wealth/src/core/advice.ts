import { daysBetween, fmtDate, fyEnd, fyOf } from './dates'
import { ltDate, unlockDate } from './lots'
import type { Holding } from './valuation'
import { marginalRate, regimeOf, type PersonYear } from './tax'
import type { Holder, Sip, TaxRules, Txn } from './types'

export type Level = 'act' | 'warn' | 'info' | 'good'

export interface PlanRow {
  holder_id: string
  instrument_id: string
  name: string
  units: number
  value: number
  gain: number
}

export interface Advice {
  id: string
  level: Level
  person_id?: string
  holder_ids: string[]
  title: string
  body: string
  saving?: number
  plan?: PlanRow[]
}

const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')
const isEq = (tc: string) => tc === 'equity' || tc === 'equity_elss'

export interface AdviceInput {
  holdings: Holding[]
  holders: Holder[]
  years: PersonYear[]
  sips: Sip[]
  txns: Txn[]
  rules: TaxRules
  today: string
}

export function harvestPlan(py: PersonYear, holdings: Holding[], r: TaxRules, today: string) {
  const ids = new Set(py.members.map((m) => m.id))
  let room = py.exemptionLeft + py.shortfallLeft - r.harvest_buffer
  const candidates: { h: Holding; date: string; units: number; cpu: number }[] = []
  for (const h of holdings) {
    if (!ids.has(h.pos.holder_id) || !isEq(h.pos.instrument.tax_class) || h.price == null) continue
    for (const l of h.pos.lots) {
      const lt = ltDate(l.date, h.pos.instrument.tax_class, r)
      const unlock = unlockDate(l.date, h.pos.instrument.tax_class, r)
      if (!lt || today < lt || (unlock && today < unlock)) continue
      if (daysBetween(l.date, today) < h.pos.instrument.exit_load_days) continue
      if (h.price - l.cost_per_unit <= 0) continue
      candidates.push({ h, date: l.date, units: l.units, cpu: l.cost_per_unit })
    }
  }
  // FIFO is per fund, so take each fund's lots oldest-first; funds marked "exit" go first.
  candidates.sort(
    (a, b) => Number(a.h.pos.instrument.keep) - Number(b.h.pos.instrument.keep) || a.date.localeCompare(b.date),
  )
  const rows = new Map<string, PlanRow>()
  const blocked = new Set<string>() // once a fund's lot is only partly taken, later lots of that fund can't be sold first
  let total = 0
  for (const c of candidates) {
    if (room <= 50) break
    const key = `${c.h.pos.holder_id}|${c.h.pos.instrument.id}`
    if (blocked.has(key)) continue
    // FIFO check: all earlier lots of this fund must be fully sold in the plan
    const earlier = c.h.pos.lots.filter((l) => l.date < c.date)
    const already = rows.get(key)?.units ?? 0
    const earlierUnits = earlier.reduce((s, l) => s + l.units, 0)
    if (earlierUnits - already > 1e-6) {
      blocked.add(key)
      continue
    }
    const gpu = c.h.price! - c.cpu
    let units = c.units
    if (units * gpu > room) {
      units = c.h.pos.instrument.kind === 'MF' ? Math.floor((room / gpu) * 1000) / 1000 : Math.floor(room / gpu)
      blocked.add(key)
    }
    if (units <= 0) continue
    const gain = units * gpu
    room -= gain
    total += gain
    const row = rows.get(key) ?? {
      holder_id: c.h.pos.holder_id,
      instrument_id: c.h.pos.instrument.id,
      name: c.h.pos.instrument.name,
      units: 0,
      value: 0,
      gain: 0,
    }
    row.units += units
    row.value += units * c.h.price!
    row.gain += gain
    rows.set(key, row)
  }
  return { rows: [...rows.values()], total }
}

export function buildAdvice(inp: AdviceInput): Advice[] {
  const { holdings, holders, years, sips, txns, rules: r, today } = inp
  const out: Advice[] = []
  const name = (id: string) => holders.find((h) => h.id === id)?.name ?? '?'
  const fy = fyOf(today)
  const daysLeft = daysBetween(today, fyEnd(fy))
  const month = Number(today.slice(5, 7))
  const ltRate = (r.equity_lt_rate * (1 + r.cess / 100)) / 100

  // 1. Tax-free profit booking (gain harvesting)
  for (const py of years) {
    const plan = harvestPlan(py, holdings, r, today)
    const who = py.members.map((m) => m.name).join(' + ')
    if (plan.total > 500) {
      out.push({
        id: `harvest-${py.person.id}`,
        level: month <= 3 ? 'act' : 'info',
        person_id: py.person.id,
        holder_ids: py.members.map((m) => m.id),
        title: `${who}: book ${inr(plan.total)} profit tax-free this year`,
        body:
          `Sell these units and reinvest the same day (into the same fund or a fund you are keeping). ` +
          `The profit stays inside the ${inr(r.ltcg_exemption)} yearly tax-free limit` +
          (py.shortfallLeft > 0 ? ` plus ${inr(py.shortfallLeft)} unused basic exemption` : '') +
          `, and your buying cost goes up, so less tax later. ${daysLeft} days left in ${'FY'} (till ${fmtDate(fyEnd(fy))}).` +
          (month <= 3 ? ' Do it before mid-March so money settles in time.' : ' Best done between January and mid-March.'),
        saving: plan.total * ltRate,
        plan: plan.rows,
      })
    } else if (py.exemptionLeft < r.ltcg_exemption && py.exemptionLeft <= r.harvest_buffer) {
      out.push({
        id: `harvest-done-${py.person.id}`,
        level: 'good',
        person_id: py.person.id,
        holder_ids: py.members.map((m) => m.id),
        title: `${who}: tax-free limit used for this year`,
        body: `Long-term equity profit booked this year has used the ${inr(r.ltcg_exemption)} limit. Avoid selling more long-term units until 1 April unless needed.`,
      })
    }
  }

  // 2. Don't sell yet — units turning long-term soon
  for (const h of holdings) {
    const tc = h.pos.instrument.tax_class
    if (h.price == null) continue
    let gain = 0
    let first: string | null = null
    for (const l of h.pos.lots) {
      const lt = ltDate(l.date, tc, r)
      if (!lt || today >= lt) continue
      const d = daysBetween(today, lt)
      if (d > r.near_lt_warn_days) continue
      const g = l.units * (h.price - l.cost_per_unit)
      if (g <= 0) continue
      gain += g
      if (!first || lt < first) first = lt
    }
    if (gain > 1000 && first) {
      const stRate = isEq(tc) ? r.equity_st_rate : 30
      out.push({
        id: `nearlt-${h.pos.holder_id}-${h.pos.instrument.id}`,
        level: 'warn',
        holder_ids: [h.pos.holder_id],
        title: `${name(h.pos.holder_id)}: don't sell ${h.pos.instrument.name} before ${fmtDate(first)}`,
        body: `Some units become long-term on ${fmtDate(first)} (in ${daysBetween(today, first)} days). Selling them now taxes ${inr(gain)} profit at ${stRate}%${isEq(tc) ? '' : ' (slab)'}; after that date it is 12.5% or even tax-free within the yearly limit.`,
        saving: (gain * stRate * (1 + r.cess / 100)) / 100,
      })
    }
  }

  // 3. Loss booking to cancel this year's taxable gains
  for (const py of years) {
    const g = py.gains
    const taxableGain = Math.max(0, g.eqST) + Math.max(0, g.slab) + Math.max(0, g.eqLT - r.ltcg_exemption) + Math.max(0, g.neLT)
    if (taxableGain <= 0) continue
    const ids = new Set(py.members.map((m) => m.id))
    const losers = holdings.filter((h) => ids.has(h.pos.holder_id) && h.gain < -500)
    if (!losers.length) continue
    out.push({
      id: `lossbook-${py.person.id}`,
      level: 'act',
      person_id: py.person.id,
      holder_ids: py.members.map((m) => m.id),
      title: `${py.members.map((m) => m.name).join(' + ')}: cut this year's tax by booking losses`,
      body: `This year has ${inr(taxableGain)} of taxable profit. Selling investments that are in loss cancels it out (short-term losses can cancel any profit; long-term losses only long-term profit). Candidates: ${losers
        .slice(0, 5)
        .map((h) => `${h.pos.instrument.name} (${inr(h.gain)})`)
        .join(', ')}.`,
    })
  }

  // 4. Stocks sitting at big losses
  for (const hid of new Set(holdings.map((h) => h.pos.holder_id))) {
    const bad = holdings.filter((h) => h.pos.holder_id === hid && h.pos.instrument.kind === 'STOCK' && h.gain < 0 && h.gain / h.invested < -0.2)
    if (bad.length >= 2) {
      const loss = bad.reduce((s, h) => s + h.gain, 0)
      out.push({
        id: `losers-${hid}`,
        level: 'info',
        holder_ids: [hid],
        title: `${name(hid)}: ${bad.length} stocks are down more than 20% (${inr(loss)})`,
        body: `If you would not buy these today, consider selling and moving the money to a diversified fund. Booked losses can be carried forward for 8 years to cancel future profit — but only if the tax return is filed before the due date. Stocks: ${bad.map((h) => h.pos.instrument.code).join(', ')}.`,
      })
    }
  }

  // 5. ELSS lock-in
  for (const h of holdings) {
    if (h.pos.instrument.tax_class !== 'equity_elss') continue
    const locked = h.pos.lots.map((l) => unlockDate(l.date, 'equity_elss', r)!).filter((u) => u > today)
    if (locked.length)
      out.push({
        id: `elss-${h.pos.holder_id}-${h.pos.instrument.id}`,
        level: 'info',
        holder_ids: [h.pos.holder_id],
        title: `${name(h.pos.holder_id)}: ${h.pos.instrument.name} is locked`,
        body: `ELSS units can't be sold for 3 years. Next units unlock on ${fmtDate(locked.sort()[0])}. Under the new tax regime ELSS gives no tax deduction, so there's no need to add more.`,
      })
  }

  // 6. Risk mix & duplicates (family level)
  const total = holdings.reduce((s, h) => s + h.value, 0)
  if (total > 0) {
    const share = (cats: string[]) => holdings.filter((h) => cats.includes(h.category)).reduce((s, h) => s + h.value, 0) / total
    const risky = share(['Small', 'Mid', 'Sector/Theme'])
    if (risky > 0.5)
      out.push({
        id: 'risk-mix',
        level: 'warn',
        holder_ids: [],
        title: `${Math.round(risky * 100)}% of the money is in small-cap, mid-cap and sector funds`,
        body: `For long-term retirement money, around 55–60% in large-cap / index / flexi-cap funds is steadier. Point new SIPs to those and shift slowly using the yearly tax-free profit booking.`,
      })
    const intl = share(['International'])
    if (intl < 0.05)
      out.push({
        id: 'intl',
        level: 'info',
        holder_ids: [],
        title: `Only ${(intl * 100).toFixed(1)}% invested outside India`,
        body: `An S&P 500 / Nasdaq 100 / global fund-of-fund adds currency and global diversification. Taxed at 12.5% after 2 years (no ₹1.25L limit), so put it in the account with the lowest income — see "Where to invest next".`,
      })
    const byCat = new Map<string, Set<string>>()
    for (const h of holdings) {
      if (h.pos.instrument.kind !== 'MF') continue
      const s = byCat.get(h.category) ?? new Set()
      s.add(h.pos.instrument.name)
      byCat.set(h.category, s)
    }
    for (const [cat, names] of byCat) {
      const limit = cat === 'Sector/Theme' ? 1 : 2
      if (names.size > limit && cat !== 'Other')
        out.push({
          id: `dup-${cat}`,
          level: 'info',
          holder_ids: [],
          title: `${names.size} different ${cat} funds across the family`,
          body: `They mostly hold the same companies, so more funds ≠ more safety. Pick ${limit === 1 ? 'one (or none)' : 'one or two'} to keep, mark the rest "Exit" in Settings → Funds, and stop their SIPs. The app will then use them first for tax-free profit booking. Funds: ${[...names].join(', ')}.`,
        })
    }
  }

  // 7. SIP still running into a fund marked for exit
  for (const s of sips) {
    const h = holdings.find((x) => x.pos.instrument.id === s.instrument_id)
    if (s.active && h && !h.pos.instrument.keep)
      out.push({
        id: `sipexit-${s.id}`,
        level: 'warn',
        holder_ids: [s.holder_id],
        title: `${name(s.holder_id)}: SIP still running in ${h.pos.instrument.name}`,
        body: `You marked this fund "Exit". Stop or move this ₹${s.amount.toLocaleString('en-IN')} SIP to a fund you're keeping.`,
      })
  }

  // 8. Pending orders
  const pend = txns.filter((t) => t.status === 'pending')
  if (pend.length)
    out.push({
      id: 'pending',
      level: 'info',
      holder_ids: [],
      title: `${pend.length} order${pend.length > 1 ? 's' : ''} waiting for the day's NAV / price`,
      body: 'They are filled automatically by the nightly price update (AMFI publishes NAVs late evening).',
    })

  const order: Record<Level, number> = { act: 0, warn: 1, info: 2, good: 3 }
  return out.sort((a, b) => order[a.level] - order[b.level] || (b.saving ?? 0) - (a.saving ?? 0))
}

export interface InvestRank {
  person: Holder
  members: Holder[]
  score: number
  reason: string
}

/** Which family account to use for new money, by type of investment. */
export function whereToInvest(years: PersonYear[], holdings: Holding[], r: TaxRules) {
  const equity: InvestRank[] = []
  const other: InvestRank[] = []
  for (const py of years) {
    const ids = new Set(py.members.map((m) => m.id))
    const queued = holdings
      .filter((h) => ids.has(h.pos.holder_id) && isEq(h.pos.instrument.tax_class))
      .reduce((s, h) => s + Math.max(0, h.gain), 0)
    const yrs = queued / r.ltcg_exemption
    const who = py.members.length > 1 ? ` (incl. ${py.members.filter((m) => m.id !== py.person.id).map((m) => m.name).join(', ')} — clubbed)` : ''
    equity.push({
      person: py.person,
      members: py.members,
      score: yrs,
      reason: `Unbooked equity profit ${inr(queued)} ≈ ${yrs.toFixed(1)} years of the ₹1.25L tax-free limit already queued${who}.`,
    })
    const rg = regimeOf(r, py.person)
    const mr = marginalRate(py.person.other_income, r, py.person)
    const room = Math.max(0, rg.basic - py.person.other_income)
    other.push({
      person: py.person,
      members: py.members,
      score: mr - room / 1e6,
      reason:
        `Taxable income ${inr(py.person.other_income)}/yr (${py.person.regime === 'old' ? 'old' : 'new'} regime) → top slab ${mr}%` +
        (room > 0 ? `; ${inr(room)} of yearly income/gains is tax-free (unused basic exemption)` : '') +
        (py.person.other_income + 1 <= rg.rebateLimit ? `; slab-taxed income is tax-free up to ₹${(rg.rebateLimit / 1e5).toFixed(0)}L total (rebate)` : '') +
        who +
        '.',
    })
  }
  equity.sort((a, b) => a.score - b.score)
  other.sort((a, b) => a.score - b.score)
  return { equity, other }
}
