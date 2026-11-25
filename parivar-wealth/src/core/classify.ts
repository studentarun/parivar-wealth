import type { Category, Kind, TaxClass } from './types'

/** Best guess of category from a fund / ETF name. Admin can change it later. */
export function guessCategory(name: string, kind: Kind): Category {
  const n = name.toLowerCase()
  if (/elss|tax saver|taxsaver/.test(n)) return 'ELSS'
  if (/nasdaq|s&p|s & p|\bus\b|u\.s\.|global|international|world|overseas|fang|hang ?seng|japan|china|greater china|emerging|europe|mon100|mafang|hngsng/.test(n))
    return 'International'
  if (/gold|silver/.test(n)) return 'Gold/Silver'
  if (/liquid|debt|bond|gilt|money market|overnight|corporate|duration|credit|banking & psu debt|arbitrage/.test(n)) return 'Debt'
  if (/psu|technology|digital|infra|pharma|health|bank|financial|consumption|energy|manufactur|auto|ev |ev&|new age|metal|realty|fmcg|it fund|defen|business cycle|thematic|esg|commodit/.test(n))
    return 'Sector/Theme'
  if (/small/.test(n)) return 'Small'
  if (/large ?& ?mid|large and mid/.test(n)) return 'Flexi/Multi'
  if (/mid/.test(n)) return 'Mid'
  if (/flexi|multi|focused|value|contra|dividend yield/.test(n)) return 'Flexi/Multi'
  if (/large|bluechip|nifty 50|nifty50|sensex|index|next 50|niftybees/.test(n)) return 'Large/Index'
  return kind === 'MF' ? 'Other' : 'Stocks'
}

export function guessTaxClass(name: string, cat: Category, kind: Kind): TaxClass {
  if (cat === 'ELSS') return 'equity_elss'
  if (cat === 'Debt') return 'debt'
  if (cat === 'International' || cat === 'Gold/Silver') return kind === 'MF' ? 'intl_fof' : 'listed_nonequity'
  if (kind === 'MF' && /fund of fund|fof/.test(name.toLowerCase()) && !/nifty|sensex|ev/.test(name.toLowerCase())) return 'intl_fof'
  return 'equity'
}

export function guessKind(symbol: string): Kind {
  return /BEES$|ETF$|^METAL$|^MON100$|^MAFANG$|^MASPTOP50$|^HNGSNGBEES$|^MAHKTECH$|IETF$/.test(symbol.toUpperCase()) ? 'ETF' : 'STOCK'
}

export function defaultExitLoad(kind: Kind, cat: Category): { pct: number; days: number } {
  if (kind !== 'MF') return { pct: 0, days: 0 }
  if (cat === 'ELSS' || cat === 'Debt') return { pct: 0, days: 0 }
  return { pct: 1, days: 365 }
}
