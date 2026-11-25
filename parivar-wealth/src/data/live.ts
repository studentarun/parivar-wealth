// Live store: free Supabase database shared by the family. Permissions are enforced by the
// database itself (row level security), so a family member can't bypass them.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_RULES } from '../core/rules'
import type { AppUser, DBState, PricePoint, SchemeRow, StockRow, TaxRules } from '../core/types'
import type { AuditRow, Store, Table } from './store'

export function makeClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function all<T = any>(q: () => any): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await q().range(from, from + page - 1)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < page) break
  }
  return out
}

export class LiveStore implements Store {
  mode = 'live' as const
  sb: SupabaseClient
  constructor(sb: SupabaseClient) {
    this.sb = sb
  }

  async loadAll(): Promise<DBState> {
    const sb = this.sb
    const [holders, instruments, txns, sips, prices, rules] = await Promise.all([
      all(() => sb.from('holders').select('*').order('sort').order('created_at')),
      all(() => sb.from('instruments').select('*').order('name')),
      all(() => sb.from('txns').select('*').order('date').order('id')),
      all(() => sb.from('sips').select('*').order('created_at')),
      all(() => sb.from('latest_prices').select('*').order('key')),
      this.getSetting<TaxRules>('tax_rules'),
    ])
    const num = (v: unknown) => (v == null ? null : Number(v))
    return {
      holders: holders.map((h: any) => ({ ...h, other_income: Number(h.other_income) })),
      instruments: instruments.map((i: any) => ({ ...i, exit_load_pct: Number(i.exit_load_pct) })),
      txns: txns.map((t: any) => ({ ...t, units: num(t.units), price: num(t.price), amount: num(t.amount) })),
      sips: sips.map((s: any) => ({ ...s, amount: Number(s.amount) })),
      prices: prices.map((p: any) => ({ key: p.key, date: p.date, price: Number(p.price) })),
      rules: { ...DEFAULT_RULES, ...(rules ?? {}) },
    }
  }
  async insert<T>(table: Table, rows: object[]): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await this.sb.from(table).insert(rows.slice(i, i + 500)).select()
      if (error) throw error
      out.push(...(data as T[]))
    }
    return out
  }
  async update(table: Table, id: string, patch: object) {
    const { error } = await this.sb.from(table).update(patch).eq('id', id)
    if (error) throw error
  }
  async remove(table: Table, id: string) {
    const { error } = await this.sb.from(table).delete().eq('id', id)
    if (error) throw error
  }
  async saveSetting(key: string, value: unknown) {
    const { error } = await this.sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() })
    if (error) throw error
  }
  async getSetting<T>(key: string) {
    const { data } = await this.sb.from('settings').select('value').eq('key', key).maybeSingle()
    return (data?.value as T) ?? null
  }
  async searchSchemes(q: string): Promise<SchemeRow[]> {
    const words = q.trim().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    if (/^\d+$/.test(q.trim())) {
      const { data } = await this.sb.from('amfi_schemes').select('*').eq('code', q.trim())
      return (data ?? []) as SchemeRow[]
    }
    let qb = this.sb.from('amfi_schemes').select('*')
    for (const w of words) qb = qb.ilike('name', `%${w}%`)
    const { data, error } = await qb.order('name').limit(30)
    if (error) throw error
    return (data ?? []) as SchemeRow[]
  }
  async searchStocks(q: string): Promise<StockRow[]> {
    const Q = q.trim().toUpperCase()
    if (!Q) return []
    const { data, error } = await this.sb.from('nse_symbols').select('*').or(`symbol.ilike.${Q}%,name.ilike.%${Q}%`).order('symbol').limit(30)
    if (error) throw error
    return (data ?? []) as StockRow[]
  }
  async pricesFrom(key: string, from: string): Promise<PricePoint[]> {
    const { data } = await this.sb.from('prices').select('*').eq('key', key).gte('date', from).order('date').limit(30)
    return (data ?? []).map((p: any) => ({ key: p.key, date: p.date, price: Number(p.price) }))
  }
  async addPrices(rows: PricePoint[]) {
    const m = new Map(rows.map((r) => [`${r.key}|${r.date}`, r]))
    const list = [...m.values()]
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await this.sb.from('prices').upsert(list.slice(i, i + 500))
      if (error) throw error
    }
  }
  async currentUser(): Promise<AppUser | null> {
    const { data: u } = await this.sb.auth.getUser()
    if (!u.user) return null
    const { data, error } = await this.sb.rpc('register_me', { p_name: u.user.user_metadata?.name ?? u.user.email?.split('@')[0] ?? 'Me' })
    if (error) throw error
    return data as AppUser
  }
  async listUsers() {
    const { data, error } = await this.sb.from('app_users').select('*').order('created_at')
    if (error) throw error
    return (data ?? []) as AppUser[]
  }
  async updateUser(user_id: string, patch: object) {
    const { error } = await this.sb.from('app_users').update(patch).eq('user_id', user_id)
    if (error) throw error
  }
  async removeUser(user_id: string) {
    const { error } = await this.sb.from('app_users').delete().eq('user_id', user_id)
    if (error) throw error
  }
  async audit(limit: number): Promise<AuditRow[]> {
    const { data } = await this.sb.from('audit_log').select('*').order('at', { ascending: false }).limit(limit)
    return (data ?? []) as AuditRow[]
  }
  async signOut() {
    await this.sb.auth.signOut()
  }
}
