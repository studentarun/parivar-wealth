// Date helpers. All dates are plain 'YYYY-MM-DD' strings in Indian time.

export const pad = (n: number) => String(n).padStart(2, '0')

export function todayIST(now = new Date()): string {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000)
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`
}

export function nowISTHour(now = new Date()): number {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000)
  return ist.getHours() + ist.getMinutes() / 60
}

const parts = (d: string) => d.split('-').map(Number) as [number, number, number]

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Add months, clipping the day to the month's end (31 Jan + 1m = 28/29 Feb). */
export function addMonths(d: string, n: number): string {
  const [y, m, day] = parts(d)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad(nm)}-${pad(Math.min(day, daysInMonth(ny, nm)))}`
}

export function addDays(d: string, n: number): string {
  const [y, m, day] = parts(d)
  const t = new Date(Date.UTC(y, m - 1, day + n))
  return t.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = parts(a)
  const [y2, m2, d2] = parts(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** Financial year start year: 2026-11-25 → 2026 (FY 2026-27); 2027-02-01 → 2026 */
export function fyOf(d: string): number {
  const [y, m] = parts(d)
  return m >= 4 ? y : y - 1
}
export const fyLabel = (fy: number) => `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`
export const fyStart = (fy: number) => `${fy}-04-01`
export const fyEnd = (fy: number) => `${fy + 1}-03-31`

/** Day of month for date with given preferred day (clipped to month end). */
export function monthDate(y: number, m: number, day: number): string {
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = parts(d)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]
  return `${day} ${mon} ${y}`
}

/** Excel serial or JS Date or string → YYYY-MM-DD */
export function toISODate(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
  if (typeof v === 'number') {
    const t = new Date(Math.round((v - 25569) * 86400000))
    return t.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[-/ ](\d{4})$/)
  if (m) {
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase())
    if (mi >= 0) return `${m[3]}-${pad(mi + 1)}-${pad(Number(m[1]))}`
  }
  const m2 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m2) return `${m2[3]}-${pad(Number(m2[2]))}-${pad(Number(m2[1]))}`
  return null
}
