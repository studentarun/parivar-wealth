import { toISODate } from '../src/core/dates'
import type { PricePoint } from '../src/core/types'

/** Column positions from the file's own header line (AMFI changes the layout from time to time). */
function amfiColumns(txt: string) {
  const head = txt.split(/\r?\n/).find((l) => /scheme code/i.test(l)) ?? ''
  const h = head.split(';').map((x) => x.trim().toLowerCase())
  const at = (...names: string[]) => {
    for (const n of names) {
      const i = h.indexOf(n)
      if (i >= 0) return i
    }
    return -1
  }
  return {
    code: Math.max(0, at('scheme code')),
    name: at('scheme name', 'nav name'),
    plan: at('plan'),
    option: at('option'),
    nav: at('net asset value'),
    date: at('date'),
  }
}

function rows(txt: string) {
  const c = amfiColumns(txt)
  const out: { code: string; name: string; nav: number; date: string }[] = []
  for (const line of txt.split(/\r?\n/)) {
    const p = line.split(';')
    if (p.length < 5 || !/^\d+$/.test(p[c.code]?.trim() ?? '')) continue
    const nav = Number(p[c.nav >= 0 ? c.nav : p.length - 2])
    const d = toISODate((p[c.date >= 0 ? c.date : p.length - 1] ?? '').trim())
    if (!isFinite(nav) || !d) continue
    let name = (p[c.name >= 0 ? c.name : 3] ?? '').trim()
    const plan = c.plan >= 0 ? p[c.plan]?.trim() : ''
    const option = c.option >= 0 ? p[c.option]?.trim() : ''
    // NAVAll has the plan/option in separate columns — add them so "Direct … Growth" is searchable
    if (plan && !name.toLowerCase().includes(plan.toLowerCase().replace(' plan', ''))) name += ` - ${plan}`
    if (option && !name.toLowerCase().includes(option.toLowerCase().replace(' option', ''))) name += ` - ${option}`
    out.push({ code: p[c.code].trim(), name, nav, date: d })
  }
  return out
}

/** AMFI NAVAll.txt (latest NAV of every scheme) */
export function parseNavAll(txt: string) {
  return rows(txt).map((r) => ({ code: r.code, name: r.name, nav: r.nav, nav_date: r.date }))
}

/** AMFI NAV history report */
export function parseNavHistory(txt: string, tracked: Set<string>): PricePoint[] {
  return rows(txt)
    .filter((r) => tracked.has(r.code))
    .map((r) => ({ key: `MF:${r.code}`, date: r.date, price: r.nav }))
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

/** IBJA (India Bullion & Jewellers Association) benchmark rates: gold ₹/10 g, silver ₹/kg → ₹ per gram */
export function parseIbja(html: string): { date: string; gold24: number; silver: number } | null {
  const pick = (base: string) => {
    for (const s of ['PM', 'AM']) {
      const m = html.match(new RegExp(`id="${base}_${s}"[^>]*>\\s*([\\d.,]+)\\s*<`))
      if (m && Number(m[1].replace(/,/g, ''))) return Number(m[1].replace(/,/g, ''))
    }
    return 0
  }
  const g = pick('lblGold999')
  const s = pick('lblSilver999')
  const dm = html.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!g) return null
  return { date: dm ? `${dm[3]}-${dm[2]}-${dm[1]}` : '', gold24: g / 10, silver: s / 1000 }
}
