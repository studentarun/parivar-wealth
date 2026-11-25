// Demo store: keeps everything in this browser only (localStorage). Used to try the app
// with your Excel before the free cloud database is set up.
import { DEFAULT_RULES } from '../core/rules'
import type { AppUser, DBState, PricePoint, SchemeRow, StockRow, TaxRules } from '../core/types'
import { ALL_PERMS, uid, type AuditRow, type Store, type Table } from './store'

const KEY = 'pw-demo-v1'
const SKEY = 'pw-demo-schemes-v1'

interface DemoData {
  holders: DBState['holders']
  instruments: DBState['instruments']
  txns: DBState['txns']
  sips: DBState['sips']
  prices: PricePoint[]
  settings: Record<string, unknown>
  audit: AuditRow[]
}

const empty = (): DemoData => ({ holders: [], instruments: [], txns: [], sips: [], prices: [], settings: {}, audit: [] })

function read<T>(k: string, d: T): T {
  try {
    const s = localStorage.getItem(k)
    return s ? (JSON.parse(s) as T) : d
  } catch {
    return d
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch (e) {
    console.warn('Could not save demo data', e)
  }
}

export class DemoStore implements Store {
  mode = 'demo' as const
  private d: DemoData = read(KEY, empty())
  private schemes: SchemeRow[] = read(SKEY, [])
  private save() {
    write(KEY, this.d)
  }
  private log(action: string, tbl: string, details: object) {
    this.d.audit.unshift({ id: Date.now() + Math.random(), at: new Date().toISOString(), email: 'demo@local', action, tbl, details: details as Record<string, unknown> })
    this.d.audit = this.d.audit.slice(0, 500)
  }

  async loadAll(): Promise<DBState> {
    return {
      holders: [...this.d.holders],
      instruments: [...this.d.instruments],
      txns: [...this.d.txns],
      sips: [...this.d.sips],
      prices: [...this.d.prices],
      rules: (this.d.settings.tax_rules as TaxRules) ?? DEFAULT_RULES,
    }
  }
  async insert<T>(table: Table, rows: object[]): Promise<T[]> {
    const out = rows.map((r) => ({ id: uid(), created_at: new Date().toISOString(), ...r }))
    ;(this.d[table] as object[]).push(...out)
    if (rows.length <= 5) out.forEach((r) => this.log('INSERT', table, r))
    else this.log('INSERT', table, { rows: rows.length })
    this.save()
    return out as T[]
  }
  async update(table: Table, id: string, patch: object) {
    const arr = this.d[table] as { id: string }[]
    const i = arr.findIndex((x) => x.id === id)
    if (i >= 0) arr[i] = { ...arr[i], ...patch }
    this.log('UPDATE', table, { id, ...patch })
    this.save()
  }
  async remove(table: Table, id: string) {
    const arr = this.d[table] as { id: string }[]
    const row = arr.find((x) => x.id === id)
    ;(this.d as unknown as Record<string, object[]>)[table] = arr.filter((x) => x.id !== id)
    if (table === 'holders') {
      this.d.txns = this.d.txns.filter((t) => t.holder_id !== id)
      this.d.sips = this.d.sips.filter((t) => t.holder_id !== id)
    }
    this.log('DELETE', table, row ?? { id })
    this.save()
  }
  async saveSetting(key: string, value: unknown) {
    this.d.settings[key] = value
    this.log('UPDATE', 'settings', { key })
    this.save()
  }
  async getSetting<T>(key: string) {
    return (this.d.settings[key] as T) ?? null
  }
  async searchSchemes(q: string) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const res: SchemeRow[] = []
    for (const s of this.schemes) {
      const n = s.name.toLowerCase()
      if (words.every((w) => n.includes(w) || s.code === w)) res.push(s)
      if (res.length >= 30) break
    }
    return res
  }
  async searchStocks(q: string): Promise<StockRow[]> {
    const Q = q.toUpperCase().trim()
    const seen = new Map<string, StockRow>()
    for (const p of this.d.prices) {
      if (!p.key.startsWith('NSE:')) continue
      const sym = p.key.slice(4)
      if (!sym.includes(Q)) continue
      const cur = seen.get(sym)
      if (!cur || cur.date < p.date) seen.set(sym, { symbol: sym, name: sym, close: p.price, date: p.date })
    }
    return [...seen.values()].slice(0, 30)
  }
  async pricesFrom(key: string, from: string) {
    return this.d.prices.filter((p) => p.key === key && p.date >= from).sort((a, b) => a.date.localeCompare(b.date))
  }
  async addPrices(rows: PricePoint[]) {
    const m = new Map(this.d.prices.map((p) => [`${p.key}|${p.date}`, p]))
    for (const r of rows) m.set(`${r.key}|${r.date}`, r)
    this.d.prices = [...m.values()]
    this.save()
  }
  async seedSchemes(rows: SchemeRow[]) {
    this.schemes = rows
    write(SKEY, rows)
  }
  async currentUser(): Promise<AppUser> {
    return { user_id: 'demo', email: 'demo@local', display_name: 'You (demo)', role: 'admin', perms: ALL_PERMS }
  }
  async listUsers() {
    return [await this.currentUser()]
  }
  async updateUser() {}
  async removeUser() {}
  async audit(limit: number) {
    return this.d.audit.slice(0, limit)
  }
  async signOut() {}
  async reassignHolder(from: string, to: string) {
    this.d.txns = this.d.txns.map((t) => (t.holder_id === from ? { ...t, holder_id: to } : t))
    this.d.sips = this.d.sips.map((t) => (t.holder_id === from ? { ...t, holder_id: to } : t))
    this.d.holders = this.d.holders.map((h) => (h.clubbed_with === from ? { ...h, clubbed_with: to } : h))
    this.log('UPDATE', 'holders', { merged: from, into: to })
    this.save()
  }
  async allPrices() {
    return [...this.d.prices]
  }
  async reset() {
    this.d = empty()
    this.save()
  }
}
