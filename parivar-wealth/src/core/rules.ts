import type { TaxRules } from './types'

/**
 * Default tax rules (India, new tax regime) as understood for FY 2026-27.
 * These live in the database "settings" table and the admin can edit them
 * from Settings → Tax rules after every Budget. Always confirm with a CA.
 */
export const DEFAULT_RULES: TaxRules = {
  version: 'FY2026-27 v1',
  fy_label: 'FY 2026-27',
  equity_lt_months: 12,
  equity_lt_rate: 12.5,
  equity_st_rate: 20,
  ltcg_exemption: 125000,
  nonequity_listed_lt_months: 12,
  nonequity_unlisted_lt_months: 24,
  nonequity_lt_rate: 12.5,
  specified_window_from: '2023-04-01',
  specified_window_to: '2025-03-31',
  elss_lock_months: 36,
  cess: 4,
  stamp_duty: 0.005,
  basic_exemption: 400000,
  slabs: [
    { upto: 400000, rate: 0 },
    { upto: 800000, rate: 5 },
    { upto: 1200000, rate: 10 },
    { upto: 1600000, rate: 15 },
    { upto: 2000000, rate: 20 },
    { upto: 2400000, rate: 25 },
    { upto: null, rate: 30 },
  ],
  rebate_income_limit: 1200000,
  rebate_max: 60000,
  harvest_buffer: 2000,
  near_lt_warn_days: 60,
  last_reviewed: '2026-11-25',
}
