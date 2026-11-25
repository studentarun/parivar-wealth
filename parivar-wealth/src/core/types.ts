// Shared data types. Same shapes are used by the app, the database and the nightly job.

export type Kind = 'MF' | 'STOCK' | 'ETF'

/** How the government taxes the gains of this investment. */
export type TaxClass =
  | 'equity' // Indian equity MF / stock / equity ETF: LT after 12m @12.5% above ₹1.25L, ST 20%
  | 'equity_elss' // same as equity but 3-year lock-in
  | 'intl_fof' // international / non-equity fund-of-funds: LT after 24m @12.5%, else slab
  | 'listed_nonequity' // listed ETF that is not Indian equity (gold, silver, Nasdaq ETF): LT after 12m @12.5%
  | 'debt' // debt fund: always at slab rate

export type Category =
  | 'Large/Index'
  | 'Flexi/Multi'
  | 'Mid'
  | 'Small'
  | 'Sector/Theme'
  | 'ELSS'
  | 'International'
  | 'Gold/Silver'
  | 'Debt'
  | 'Stocks'
  | 'Other'

export interface Holder {
  id: string
  name: string
  relation?: string | null
  /** Taxable income other than capital gains, per year (pension/salary after standard deduction, rent, FD interest). */
  other_income: number
  /** If this person's investments were funded by their spouse, gains are taxed in the spouse's hands (clubbing). */
  clubbed_with?: string | null
  sort?: number
  /** login email of this family member — signing up with it gives instant access */
  email?: string | null
  regime?: 'new' | 'old'
  age_group?: AgeGroup
  /** gross yearly income by source; other_income (taxable) is calculated from it unless income_override */
  income?: IncomeSources | null
  income_override?: boolean
}

export type AgeGroup = 'below60' | '60to79' | '80plus'
export interface IncomeSources {
  salary?: number
  pension?: number
  rent?: number
  interest?: number
  other?: number
  /** old regime only: 80C, 80D, home-loan interest etc. */
  deductions?: number
}

export interface Instrument {
  id: string
  kind: Kind
  /** AMFI scheme code for MF, NSE symbol for STOCK/ETF */
  code: string
  name: string
  tax_class: TaxClass
  category: Category
  exit_load_pct: number
  exit_load_days: number
  /** false = we plan to exit this fund (used first for profit booking / consolidation) */
  keep: boolean
}

export type TxnType = 'BUY' | 'SELL'
export type TxnStatus = 'done' | 'pending'

export interface Txn {
  id: string
  holder_id: string
  instrument_id: string
  /** trade date requested (YYYY-MM-DD). For pending rows this is the order date. */
  date: string
  type: TxnType
  units: number | null
  price: number | null
  /** money in (BUY) or money requested (SELL by amount) */
  amount: number | null
  status: TxnStatus
  source: 'manual' | 'sip' | 'import'
  sip_id?: string | null
  /** for MF: order placed after the 3 PM cut-off, so next working day's NAV applies */
  after_cutoff?: boolean
  note?: string | null
  created_by?: string | null
  created_at?: string
}

export interface Sip {
  id: string
  holder_id: string
  instrument_id: string
  amount: number
  day: number
  start_date: string
  end_date?: string | null
  active: boolean
  /** stocks/ETFs: money kept aside for brokerage & charges; whole units are bought with the rest */
  charges?: number
  /** last due date that has been turned into a transaction */
  last_run_date?: string | null
}

export interface PricePoint {
  key: string // `${kind}:${code}`
  date: string
  price: number
}

export interface SchemeRow {
  code: string
  name: string
  nav: number
  nav_date: string
}

export interface StockRow {
  symbol: string
  name: string
  close: number
  date: string
}

export type Role = 'admin' | 'member' | 'pending'

export interface Perms {
  add: boolean
  withdraw: boolean
  delete: boolean
  settings: boolean
  /** holder ids this user can see; empty = all */
  holders: string[]
}

export interface AppUser {
  user_id: string
  email: string
  display_name: string
  role: Role
  perms: Perms
}

export interface TaxRules {
  version: string
  fy_label: string
  equity_lt_months: number
  equity_lt_rate: number
  equity_st_rate: number
  ltcg_exemption: number
  nonequity_listed_lt_months: number
  nonequity_unlisted_lt_months: number
  nonequity_lt_rate: number
  /** intl FoFs bought in this window are "specified mutual funds": always slab rate */
  specified_window_from: string
  specified_window_to: string
  elss_lock_months: number
  cess: number
  stamp_duty: number
  basic_exemption: number
  slabs: { upto: number | null; rate: number }[]
  rebate_income_limit: number
  rebate_max: number
  /** old tax regime */
  old_slabs_below60: { upto: number | null; rate: number }[]
  old_slabs_60to79: { upto: number | null; rate: number }[]
  old_slabs_80plus: { upto: number | null; rate: number }[]
  old_rebate_income_limit: number
  old_rebate_max: number
  std_deduction_new: number
  std_deduction_old: number
  harvest_buffer: number
  near_lt_warn_days: number
  last_reviewed: string
}

import type { Asset, MetalRates } from './assets'

export interface DBState {
  holders: Holder[]
  instruments: Instrument[]
  txns: Txn[]
  sips: Sip[]
  prices: PricePoint[] // at least the latest per key
  rules: TaxRules
  assets: Asset[]
  metal: MetalRates | null
}

export const priceKey = (i: Pick<Instrument, 'kind' | 'code'>) => `${i.kind === 'MF' ? 'MF' : 'NSE'}:${i.code}`
