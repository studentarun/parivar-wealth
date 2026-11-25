import { toISODate } from '../src/core/dates'
import type { PricePoint } from '../src/core/types'

/** AMFI NAVAll.txt: Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date */
export function parseNavAll(txt: string) {
  const out: { code: string; name: string; nav: number; nav_date: string }[] = []
  for (const line of txt.split(/\r?\n/)) {
    const p = line.split(';')
    if (p.length < 6 || !/^\d+$/.test(p[0].trim())) continue
    const nav = Number(p[4])
    const d = toISODate(p[5].trim())
    if (!isFinite(nav) || !d) continue
    out.push({ code: p[0].trim(), name: p[3].trim(), nav, nav_date: d })
  }
  return out
}

/** AMFI history: Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date */
export function parseNavHistory(txt: string, tracked: Set<string>): PricePoint[] {
  const rows: PricePoint[] = []
  for (const line of txt.split(/\r?\n/)) {
    const p = line.split(';')
    if (p.length < 8 || !tracked.has(p[0].trim())) continue
    const nav = Number(p[4])
    const d = toISODate(p[7].trim())
    if (isFinite(nav) && d) rows.push({ key: `MF:${p[0].trim()}`, date: d, price: nav })
  }
  return rows
}

/** NSE CM bhavcopy (UDiFF format, since Jul 2024) */
export function parseBhav(csv: string, day: string, tracked: Set<string>) {
  const lines = csv.trim().split(/\r?\n/)
  const head = lines[0].split(',').map((h) => h.trim())
  const ix = (n: string) => head.indexOf(n)
  const [iSym, iSer, iCls, iNm, iDt] = [ix('TckrSymb'), ix('SctySrs'), ix('ClsPric'), ix('FinInstrmNm'), ix('TradDt')]
  const syms: { symbol: string; name: string; close: number; date: string }[] = []
  const prices: PricePoint[] = []
  for (const l of lines.slice(1)) {
    const c = l.split(',')
    if (!['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(c[iSer])) continue
    const close = Number(c[iCls])
    if (!isFinite(close)) continue
    const date = toISODate(c[iDt]) ?? day
    syms.push({ symbol: c[iSym], name: c[iNm], close, date })
    if (tracked.has(c[iSym])) prices.push({ key: `NSE:${c[iSym]}`, date, price: close })
  }
  return { syms, prices }
}
