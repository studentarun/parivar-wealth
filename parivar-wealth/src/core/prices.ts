import type { PricePoint } from './types'

/** Fast lookup of prices by key and date. */
export class PriceBook {
  private map = new Map<string, { date: string; price: number }[]>()

  constructor(points: PricePoint[] = []) {
    for (const p of points) this.add(p)
    for (const arr of this.map.values()) arr.sort((a, b) => a.date.localeCompare(b.date))
  }

  add(p: PricePoint) {
    let arr = this.map.get(p.key)
    if (!arr) this.map.set(p.key, (arr = []))
    const i = arr.findIndex((x) => x.date === p.date)
    if (i >= 0) arr[i] = { date: p.date, price: p.price }
    else {
      arr.push({ date: p.date, price: p.price })
      if (arr.length > 1 && arr[arr.length - 2].date > p.date) arr.sort((a, b) => a.date.localeCompare(b.date))
    }
  }

  latest(key: string) {
    const arr = this.map.get(key)
    return arr && arr.length ? arr[arr.length - 1] : null
  }

  /** First price on or after the date (NAV allotment: holiday → next working day). */
  onOrAfter(key: string, date: string, notAfter?: string) {
    const arr = this.map.get(key)
    if (!arr) return null
    for (const x of arr) if (x.date >= date) return notAfter && x.date > notAfter ? null : x
    return null
  }

  /** Last price on or before the date. */
  onOrBefore(key: string, date: string) {
    const arr = this.map.get(key)
    if (!arr) return null
    let r: { date: string; price: number } | null = null
    for (const x of arr) {
      if (x.date <= date) r = x
      else break
    }
    return r
  }

  keys() {
    return [...this.map.keys()]
  }
}
