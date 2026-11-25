import type { AssetType } from '../../core/assets'

export interface FieldDef {
  k: string
  label: string
  kind: 'number' | 'text' | 'date' | 'select'
  options?: { v: string; label: string }[]
  hint?: string
  show?: (d: Record<string, any>) => boolean
  def?: string | number
}

const opt = (...xs: [string, string][]) => xs.map(([v, label]) => ({ v, label }))
const isLand = (d: Record<string, any>) => d.kind !== 'flat'
const hasBuilding = (d: Record<string, any>) => d.kind === 'house' || d.kind === 'commercial'

export const FIELDS: Record<AssetType, FieldDef[]> = {
  fd: [
    { k: 'bank', label: 'Bank / post office', kind: 'text' },
    { k: 'principal', label: 'Amount deposited (₹)', kind: 'number' },
    { k: 'rate', label: 'Interest rate (% per year)', kind: 'number' },
    { k: 'start_date', label: 'Start date', kind: 'date' },
    { k: 'maturity_date', label: 'Maturity date', kind: 'date' },
    { k: 'payout', label: 'Interest', kind: 'select', def: 'cumulative', options: opt(['cumulative', 'Added to FD (cumulative)'], ['quarterly', 'Paid out every quarter'], ['monthly', 'Paid out every month']) },
    { k: 'compounding', label: 'Compounding', kind: 'select', def: '4', options: opt(['4', 'Quarterly (most banks)'], ['12', 'Monthly'], ['1', 'Yearly']), show: (d) => (d.payout ?? 'cumulative') === 'cumulative' },
  ],
  gold: [
    { k: 'item', label: 'What is it?', kind: 'select', def: 'jewellery', options: opt(['jewellery', 'Jewellery'], ['coin', 'Coin'], ['bar', 'Bar / biscuit']) },
    { k: 'grams', label: 'Weight (grams)', kind: 'number', hint: 'Net gold weight, without stones' },
    { k: 'purity', label: 'Purity', kind: 'select', def: '22K', options: opt(['24K', '24K (999)'], ['22K', '22K (916) — most jewellery'], ['20K', '20K (833)'], ['18K', '18K (750)'], ['14K', '14K (585)']) },
    { k: 'resale_cut_pct', label: 'Deduction when selling (%)', kind: 'number', hint: 'Jewellers usually cut 5–10% on old jewellery; 0 for coins/bars', def: 8 },
    { k: 'cost', label: 'Price paid (₹, optional)', kind: 'number' },
    { k: 'bought', label: 'Bought on (optional)', kind: 'date' },
  ],
  silver: [
    { k: 'item', label: 'What is it?', kind: 'select', def: 'utensil', options: opt(['utensil', 'Utensils / items'], ['jewellery', 'Jewellery'], ['coin', 'Coin'], ['bar', 'Bar']) },
    { k: 'grams', label: 'Weight (grams)', kind: 'number' },
    { k: 'purity', label: 'Purity', kind: 'select', def: '925', options: opt(['999', '999 (fine)'], ['925', '925 (sterling)'], ['900', '900'], ['800', '800']) },
    { k: 'resale_cut_pct', label: 'Deduction when selling (%)', kind: 'number', def: 5 },
    { k: 'cost', label: 'Price paid (₹, optional)', kind: 'number' },
  ],
  diamond: [
    { k: 'carat', label: 'Carat', kind: 'number' },
    { k: 'certificate', label: 'Certificate (IGI/GIA no.)', kind: 'text' },
    { k: 'value', label: 'Value today (₹)', kind: 'number', hint: 'Diamonds have no public daily rate — use a jeweller/valuer estimate' },
    { k: 'cost', label: 'Price paid (₹)', kind: 'number' },
  ],
  property: [
    { k: 'kind', label: 'Type', kind: 'select', def: 'house', options: opt(['agri', 'Agricultural land'], ['plot', 'Residential plot (empty)'], ['house', 'House / building'], ['flat', 'Flat / apartment'], ['commercial', 'Shop / commercial']) },
    { k: 'acquired', label: 'How acquired', kind: 'select', def: 'bought', options: opt(['bought', 'Bought'], ['inherited', 'Inherited'], ['gift', 'Gift']) },
    { k: 'address', label: 'Village / city & address', kind: 'text' },
    { k: 'state', label: 'State', kind: 'text', hint: 'Needed for bigha size and circle rates' },
    { k: 'area', label: 'Land / plot area', kind: 'number', show: isLand },
    { k: 'area_unit', label: 'Unit', kind: 'select', def: 'sq yd (gaj)', options: opt(['sq ft', 'sq ft'], ['sq yd (gaj)', 'sq yard / gaj'], ['sq m', 'sq metre'], ['bigha', 'bigha'], ['biswa', 'biswa'], ['acre', 'acre'], ['hectare', 'hectare'], ['kanal', 'kanal'], ['marla', 'marla']), show: isLand },
    { k: 'bigha_sqft', label: '1 bigha = how many sq ft here?', kind: 'number', def: 27000, hint: 'Varies by state/district (UP pucca bigha ≈ 27,000; Rajasthan ≈ 27,225; Uttarakhand ≈ 6,800–8,000). Check your khatauni.', show: (d) => isLand(d) && (d.area_unit === 'bigha' || d.area_unit === 'biswa') },
    { k: 'rate_per_unit', label: 'Market rate (₹ per unit above)', kind: 'number', hint: 'What land nearby sells for today (ask a local dealer / check 99acres)', show: isLand },
    { k: 'circle_rate', label: 'Govt circle rate (₹ per unit, optional)', kind: 'number', show: isLand },
    { k: 'floors', label: 'Floors built', kind: 'number', hint: 'Ground only = 1, ground + 1 = 2…', show: hasBuilding },
    { k: 'built_sqft_per_floor', label: 'Built-up area per floor (sq ft)', kind: 'number', show: hasBuilding },
    { k: 'quality', label: 'Construction quality', kind: 'select', def: 'standard', options: opt(['basic', 'Basic (~₹1,600/sq ft)'], ['standard', 'Standard (~₹2,200/sq ft)'], ['premium', 'Premium (~₹3,200/sq ft)']), show: hasBuilding },
    { k: 'construction_rate', label: 'Or your own construction cost (₹/sq ft)', kind: 'number', show: hasBuilding },
    { k: 'built_year', label: 'Year built', kind: 'number', hint: 'Older buildings lose ~1.5% a year (max 60%)', show: hasBuilding },
    { k: 'status', label: 'Construction status', kind: 'select', def: 'complete', options: opt(['complete', 'Complete'], ['partial', 'Partly built'], ['under', 'Under construction']), show: hasBuilding },
    { k: 'carpet_sqft', label: 'Carpet / super area (sq ft)', kind: 'number', show: (d) => d.kind === 'flat' },
    { k: 'flat_rate_sqft', label: 'Market rate (₹ per sq ft)', kind: 'number', show: (d) => d.kind === 'flat' },
    { k: 'income_amount', label: 'Rent / lease income (₹)', kind: 'number' },
    { k: 'income_period', label: 'per', kind: 'select', def: 'month', options: opt(['month', 'month'], ['year', 'year']) },
    { k: 'appreciation_pct', label: 'Expected growth (% per year)', kind: 'number', def: 6, hint: 'For future value & FIRE planning' },
    { k: 'cost', label: 'Purchase price / value when inherited (₹)', kind: 'number' },
    { k: 'bought', label: 'Bought / inherited on', kind: 'date' },
  ],
  epf: [
    { k: 'balance', label: 'Balance (₹)', kind: 'number', hint: 'From the EPFO passbook / UMANG app' },
    { k: 'as_of', label: 'Balance as on', kind: 'date' },
    { k: 'monthly', label: 'Monthly contribution, yours + employer (₹)', kind: 'number' },
    { k: 'rate', label: 'Interest rate (%)', kind: 'number', def: 8.25 },
  ],
  ppf: [
    { k: 'balance', label: 'Balance (₹)', kind: 'number' },
    { k: 'as_of', label: 'Balance as on', kind: 'date' },
    { k: 'monthly', label: 'Monthly deposit (₹)', kind: 'number' },
    { k: 'rate', label: 'Interest rate (%)', kind: 'number', def: 7.1 },
    { k: 'opened', label: 'Account opened on', kind: 'date', hint: '15-year lock-in from the end of the opening year' },
  ],
  nps: [
    { k: 'balance', label: 'Balance (₹)', kind: 'number' },
    { k: 'as_of', label: 'Balance as on', kind: 'date' },
    { k: 'monthly', label: 'Monthly contribution (₹)', kind: 'number' },
    { k: 'rate', label: 'Expected return (%)', kind: 'number', def: 9 },
  ],
  sgb: [
    { k: 'grams', label: 'Units (grams)', kind: 'number' },
    { k: 'issue_price', label: 'Issue price (₹ per gram)', kind: 'number' },
    { k: 'cost', label: 'Total paid (₹)', kind: 'number' },
    { k: 'issue_date', label: 'Issue date', kind: 'date', hint: 'Matures 8 years after issue' },
  ],
  cash: [
    { k: 'bank', label: 'Bank / where', kind: 'text' },
    { k: 'balance', label: 'Balance (₹)', kind: 'number' },
    { k: 'as_of', label: 'As on', kind: 'date' },
    { k: 'rate', label: 'Interest (%)', kind: 'number', def: 3 },
  ],
  insurance: [
    { k: 'kind', label: 'Type', kind: 'select', def: 'term', options: opt(['term', 'Term life'], ['health', 'Health'], ['endowment', 'LIC / endowment'], ['ulip', 'ULIP'], ['vehicle', 'Vehicle'], ['home', 'Home']) },
    { k: 'insurer', label: 'Insurer & policy no.', kind: 'text' },
    { k: 'cover', label: 'Cover / sum assured (₹)', kind: 'number' },
    { k: 'premium', label: 'Premium per year (₹)', kind: 'number' },
    { k: 'renewal_date', label: 'Next renewal / premium date', kind: 'date' },
    { k: 'surrender_value', label: 'Surrender / fund value today (₹, if any)', kind: 'number' },
    { k: 'nominee', label: 'Nominee', kind: 'text' },
  ],
  vehicle: [
    { k: 'cost', label: 'Price paid (₹)', kind: 'number' },
    { k: 'bought', label: 'Bought on', kind: 'date' },
    { k: 'depreciation_pct', label: 'Loses value (% per year)', kind: 'number', def: 15 },
  ],
  loan: [
    { k: 'kind', label: 'Type', kind: 'select', def: 'home', options: opt(['home', 'Home loan'], ['car', 'Car loan'], ['personal', 'Personal loan'], ['gold', 'Gold loan'], ['education', 'Education loan'], ['other', 'Other']) },
    { k: 'lender', label: 'Lender', kind: 'text' },
    { k: 'principal', label: 'Loan amount taken (₹)', kind: 'number' },
    { k: 'rate', label: 'Interest rate (%)', kind: 'number' },
    { k: 'emi', label: 'EMI (₹ per month)', kind: 'number' },
    { k: 'start_date', label: 'First EMI date', kind: 'date' },
    { k: 'prepaid', label: 'Total prepaid so far (₹)', kind: 'number' },
    { k: 'outstanding', label: 'Or: outstanding today from the bank statement (₹)', kind: 'number', hint: 'If filled, this is used instead of the calculation' },
  ],
  other: [
    { k: 'value', label: 'Value today (₹)', kind: 'number' },
    { k: 'cost', label: 'Price paid (₹)', kind: 'number' },
  ],
}

export const NOMINEE_FIELD: FieldDef = { k: 'nominee', label: 'Nominee', kind: 'text', hint: 'Who gets this if something happens — keep it updated' }
export const SHARE_FIELD: FieldDef = { k: 'share_pct', label: 'Ownership share (%)', kind: 'number', def: 100, hint: 'e.g. 50 if half the house belongs to a sibling' }
