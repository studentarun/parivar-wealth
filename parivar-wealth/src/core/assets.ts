// Everything the family owns beyond funds & stocks: FDs, gold, property, EPF/PPF/NPS, loans…
import { addMonths, daysBetween, fyEnd, fyOf, fyStart } from './dates'

export type AssetType =
  | 'fd'
  | 'gold'
  | 'silver'
  | 'diamond'
  | 'property'
  | 'epf'
  | 'ppf'
  | 'nps'
  | 'sgb'
  | 'cash'
  | 'insurance'
  | 'loan'
  | 'vehicle'
  | 'other'

export const ASSET_TYPES: { v: AssetType; label: string; icon: string; hint: string }[] = [
  { v: 'fd', label: 'Fixed deposit', icon: '🏦', hint: 'Bank / post-office FD, RD' },
  { v: 'gold', label: 'Gold', icon: '🪙', hint: 'Jewellery, coins, bars' },
  { v: 'silver', label: 'Silver', icon: '🥈', hint: 'Utensils, coins, bars' },
  { v: 'diamond', label: 'Diamond / gems', icon: '💎', hint: 'Value you enter' },
  { v: 'property', label: 'Property / land', icon: '🏡', hint: 'House, flat, plot, farm land' },
  { v: 'epf', label: 'EPF / VPF', icon: '🧾', hint: 'Provident fund balance' },
  { v: 'ppf', label: 'PPF / SSY', icon: '📗', hint: 'Public provident fund' },
  { v: 'nps', label: 'NPS', icon: '🧓', hint: 'National Pension System' },
  { v: 'sgb', label: 'Sovereign gold bond', icon: '📜', hint: 'Grams of SGB held' },
  { v: 'cash', label: 'Cash / savings', icon: '💵', hint: 'Bank balance, emergency fund' },
  { v: 'insurance', label: 'Insurance policy', icon: '🛡️', hint: 'Term, health, LIC — renewals' },
  { v: 'vehicle', label: 'Vehicle', icon: '🚗', hint: 'Car / bike (loses value yearly)' },
  { v: 'loan', label: 'Loan (owed)', icon: '📉', hint: 'Home / car / personal loan' },
  { v: 'other', label: 'Other', icon: '📦', hint: 'Anything else' },
]

export interface Asset {
  id: string
  holder_id: string | null
  type: AssetType
  name: string
  details: Record<string, any>
  value_override?: number | null
  photos?: string[] | null
  notes?: string | null
  active: boolean
  updated_at?: string
}

export interface MetalRates {
  date: string
  source: string
  gold24: number // ₹ per gram, 999
  silver: number // ₹ per gram, 999
}

/** purity → fraction of pure metal */
export const PURITY: Record<string, number> = { '24K': 0.999, '22K': 0.916, '20K': 0.833, '18K': 0.75, '14K': 0.585, '999': 0.999, '925': 0.925, '900': 0.9, '800': 0.8 }

export const AREA_UNITS: Record<string, number> = {
  // → square feet
  'sq ft': 1,
  'sq yd (gaj)': 9,
  'sq m': 10.7639,
  acre: 43560,
  hectare: 107639,
  bigha: 0, // depends on state — from details.bigha_sqft
  biswa: 0, // 1/20 bigha
  kanal: 5445,
  marla: 272.25,
}

export function areaSqft(area: number, unit: string, bighaSqft = 27000) {
  if (unit === 'bigha') return area * bighaSqft
  if (unit === 'biswa') return (area * bighaSqft) / 20
  return area * (AREA_UNITS[unit] ?? 1)
}

const yearsBetween = (a: string, b: string) => daysBetween(a, b) / 365.25

export interface Valuation {
  value: number // what it's worth today (negative for loans)
  cost?: number // what was paid
  future?: { date: string; value: number } // e.g. FD maturity
  income?: { yearly: number; label: string; taxNote?: string }
  lines: string[] // how it was worked out, in simple words
  taxNote?: string
  alerts: { level: 'warn' | 'info'; text: string }[]
  share: number // ownership share (0–1)
}

export function valueAsset(a: Asset, today: string, rates: MetalRates | null): Valuation {
  const d = a.details ?? {}
  const share = d.share_pct ? Number(d.share_pct) / 100 : 1
  const alerts: Valuation['alerts'] = []
  const lines: string[] = []
  const n = (k: string) => Number(d[k] ?? 0) || 0
  const out = (v: Omit<Valuation, 'alerts' | 'share' | 'lines'> & { lines?: string[] }): Valuation => {
    const value = a.value_override != null && a.value_override !== ('' as unknown) ? Number(a.value_override) : v.value
    if (a.value_override != null) lines.push('Value entered manually')
    return { ...v, value: value * share, cost: v.cost != null ? v.cost * share : undefined, lines: [...lines, ...(v.lines ?? [])], alerts, share }
  }

  switch (a.type) {
    case 'fd': {
      const P = n('principal')
      const r = n('rate') / 100
      const start = d.start_date || today
      const end = d.maturity_date || addMonths(start, 12 * (n('years') || 1))
      const payout = d.payout ?? 'cumulative' // cumulative | quarterly | monthly
      const freq = Number(d.compounding ?? 4) // per year
      const tNow = Math.max(0, Math.min(yearsBetween(start, today), yearsBetween(start, end)))
      const tEnd = Math.max(0, yearsBetween(start, end))
      const grow = (t: number) => P * Math.pow(1 + r / freq, freq * t)
      const value = payout === 'cumulative' ? grow(tNow) : P
      const maturity = payout === 'cumulative' ? grow(tEnd) : P
      const yearly = payout === 'cumulative' ? grow(Math.min(tNow + 1, tEnd)) - grow(tNow) : P * r
      lines.push(`₹${fmt(P)} at ${n('rate')}% (${payout === 'cumulative' ? `compounded ${freq === 4 ? 'quarterly' : freq === 12 ? 'monthly' : freq + '×/yr'}` : `interest paid ${payout}`})`)
      // interest earned in the current financial year (taxable every year, even if not paid out)
      const fy = fyOf(today)
      const a0 = fyStart(fy) > start ? fyStart(fy) : start
      const a1 = fyEnd(fy) < end ? fyEnd(fy) : end
      const fyInterest = a1 > a0 ? (payout === 'cumulative' ? grow(yearsBetween(start, a1)) - grow(yearsBetween(start, a0)) : P * r * yearsBetween(a0, a1)) : 0
      const left = daysBetween(today, end)
      if (left >= 0 && left <= 30) alerts.push({ level: 'warn', text: `Matures in ${left} days (${end})` })
      if (left < 0) alerts.push({ level: 'info', text: `Matured on ${end} — mark as closed or renew` })
      return out({
        value,
        cost: P,
        future: { date: end, value: maturity },
        income: { yearly, label: 'interest / year', taxNote: `≈ ₹${fmt(fyInterest)} interest in this financial year — taxable at slab rate even if not paid out (TDS if above ₹50k, ₹1L for seniors).` },
        taxNote: 'Interest taxed every year at slab rate. Best kept in the lowest-income family member’s name.',
      })
    }
    case 'gold':
    case 'silver':
    case 'sgb': {
      const grams = n('grams')
      const purity = a.type === 'sgb' ? 0.999 : PURITY[d.purity ?? (a.type === 'gold' ? '22K' : '999')] ?? 1
      const rate = a.type === 'silver' ? rates?.silver : rates?.gold24
      const resale = a.type === 'sgb' ? 0 : n('resale_cut_pct') / 100 // jewellery loses making/wastage when sold
      if (!rate) alerts.push({ level: 'warn', text: 'No metal rate yet — set it in More → Gold & silver rates' })
      const pure = grams * purity
      const value = rate ? pure * (rate / 0.999) * (1 - resale) : n('cost')
      lines.push(`${grams} g × ${d.purity ?? (a.type === 'sgb' ? '999' : '')} purity = ${pure.toFixed(2)} g pure`)
      if (rate) lines.push(`@ ₹${fmt(rate)}/g (999, ${rates?.date})${resale ? ` − ${(resale * 100).toFixed(0)}% resale deduction` : ''}`)
      const sgbInterest = a.type === 'sgb' ? (n('issue_price') * grams * 0.025) : 0
      return out({
        value,
        cost: n('cost') || undefined,
        income: sgbInterest ? { yearly: sgbInterest, label: '2.5% SGB interest / year', taxNote: 'Taxable at slab' } : undefined,
        taxNote:
          a.type === 'sgb'
            ? 'Held till maturity (8 yrs): profit is tax-free. Sold earlier on exchange: 12.5% after 12 months.'
            : 'Physical gold/silver: 12.5% on profit if held over 24 months, else slab rate. Keep purchase bills.',
      })
    }
    case 'property': {
      const sqft = areaSqft(n('area'), d.area_unit ?? 'sq ft', n('bigha_sqft') || 27000)
      const landRate = n('rate_per_unit') // ₹ per chosen unit
      const unitSqft = areaSqft(1, d.area_unit ?? 'sq ft', n('bigha_sqft') || 27000)
      const land = d.kind === 'flat' ? 0 : landRate * (sqft / unitSqft)
      const floors = n('floors')
      const builtPerFloor = n('built_sqft_per_floor')
      const consRate = n('construction_rate') || ({ basic: 1600, standard: 2200, premium: 3200 } as Record<string, number>)[d.quality ?? 'standard']
      const age = d.built_year ? new Date().getFullYear() - Number(d.built_year) : 0
      const dep = Math.min(0.6, age * 0.015)
      const building = d.kind === 'flat' ? n('flat_rate_sqft') * n('carpet_sqft') : floors * builtPerFloor * consRate * (1 - dep)
      let value = land + building
      if (land) lines.push(`Land: ${fmt(n('area'))} ${d.area_unit} × ₹${fmt(landRate)} = ₹${fmt(land)}`)
      if (d.kind === 'flat') lines.push(`Flat: ${fmt(n('carpet_sqft'))} sq ft × ₹${fmt(n('flat_rate_sqft'))}/sq ft`)
      else if (floors && builtPerFloor)
        lines.push(`Building: ${floors} floor(s) × ${fmt(builtPerFloor)} sq ft × ₹${fmt(consRate)}/sq ft${dep ? ` − ${(dep * 100).toFixed(0)}% for ${age} yrs age` : ''} = ₹${fmt(building)}`)
      if (n('circle_rate') && !landRate) {
        value = n('circle_rate') * (sqft / unitSqft) + building
        lines.push(`Using circle rate ₹${fmt(n('circle_rate'))} per ${d.area_unit} (market is often higher)`)
      }
      const rent = n('income_amount') * (d.income_period === 'month' ? 12 : 1)
      const growth = n('appreciation_pct') || 6
      if (share < 1) lines.push(`Your share: ${(share * 100).toFixed(0)}%`)
      return out({
        value,
        cost: n('cost') || undefined,
        future: { date: addMonths(today, 120), value: value * Math.pow(1 + growth / 100, 10) },
        income: rent ? { yearly: rent, label: d.kind === 'agri' ? 'lease income / year' : 'rent / year', taxNote: d.kind === 'agri' ? 'Agricultural income is tax-free (but counted for rate purposes if other income > ₹2.5L).' : 'Rent is taxed after a 30% standard deduction.' } : undefined,
        taxNote:
          d.kind === 'agri'
            ? 'Rural agricultural land is not a "capital asset" — selling it is tax-free. Urban agri land: 12.5% after 24 months.'
            : 'Sold after 24 months: 12.5% on profit (inherited property counts the previous owner’s holding period and cost). Reinvesting in a house (Sec 54) can save the tax.',
      })
    }
    case 'epf':
    case 'ppf':
    case 'nps':
    case 'cash': {
      const bal = n('balance')
      const asOf = d.as_of || today
      const rate = n('rate') || (a.type === 'epf' ? 8.25 : a.type === 'ppf' ? 7.1 : a.type === 'nps' ? 9 : 0)
      const months = Math.max(0, daysBetween(asOf, today) / 30.44)
      const monthly = n('monthly')
      // grow last known balance + monthly contributions to today
      let v = bal
      for (let i = 0; i < Math.floor(months); i++) v = v * (1 + rate / 1200) + monthly
      lines.push(`Balance ₹${fmt(bal)} on ${asOf}${monthly ? ` + ₹${fmt(monthly)}/month` : ''}${rate ? ` growing ~${rate}%/yr` : ''}`)
      if (months > 13) alerts.push({ level: 'info', text: 'Balance is over a year old — update it from the passbook/statement' })
      return out({
        value: v,
        taxNote:
          a.type === 'ppf'
            ? 'PPF: fully tax-free (EEE). 15-year lock-in, extendable in 5-year blocks.'
            : a.type === 'epf'
              ? 'EPF: tax-free after 5 years of service; interest on your contribution above ₹2.5L/yr is taxable.'
              : a.type === 'nps'
                ? 'NPS: 60% lump sum tax-free at 60; 40% must buy an annuity (pension taxed at slab).'
                : undefined,
      })
    }
    case 'insurance': {
      const renew = d.renewal_date
      if (renew) {
        const left = daysBetween(today, renew)
        if (left >= 0 && left <= 30) alerts.push({ level: 'warn', text: `Premium due in ${left} days` })
      }
      lines.push(`Cover ₹${fmt(n('cover'))} · premium ₹${fmt(n('premium'))}/yr`)
      return out({ value: n('surrender_value'), taxNote: 'Not counted in net worth (except any surrender value).' })
    }
    case 'vehicle': {
      const cost = n('cost')
      const yrs = d.bought ? yearsBetween(d.bought, today) : 0
      const value = cost * Math.pow(1 - (n('depreciation_pct') || 15) / 100, yrs)
      lines.push(`₹${fmt(cost)} losing ~${n('depreciation_pct') || 15}% a year`)
      return out({ value, cost })
    }
    case 'loan': {
      const P = n('principal')
      const r = n('rate') / 1200
      const emi = n('emi')
      const start = d.start_date || today
      const paid = n('prepaid')
      let bal = P
      const months = Math.max(0, Math.floor(daysBetween(start, today) / 30.44))
      for (let i = 0; i < months && bal > 0; i++) bal = bal * (1 + r) - emi
      bal = Math.max(0, (n('outstanding') || bal) - (n('outstanding') ? 0 : paid))
      let m = 0
      let b = bal
      while (b > 0 && m < 600 && emi > b * r) (b = b * (1 + r) - emi), m++
      lines.push(n('outstanding') ? `Outstanding ₹${fmt(bal)} (entered)` : `₹${fmt(P)} at ${n('rate')}%, EMI ₹${fmt(emi)} since ${start}${paid ? `, prepaid ₹${fmt(paid)}` : ''}`)
      if (emi && m) lines.push(`≈ ${Math.floor(m / 12)} yrs ${m % 12} months of EMIs left`)
      return out({
        value: -bal,
        taxNote: d.kind === 'home' ? 'Home loan interest deduction (Sec 24b, up to ₹2L) is only in the old regime for a self-occupied house.' : undefined,
      })
    }
    default:
      lines.push('Value you entered')
      return out({ value: n('value'), cost: n('cost') || undefined })
  }
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN')
