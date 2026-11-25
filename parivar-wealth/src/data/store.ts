import type { AppUser, DBState, Perms, PricePoint, SchemeRow, StockRow } from '../core/types'

export type Table = 'holders' | 'instruments' | 'txns' | 'sips'

export interface AuditRow {
  id: number
  at: string
  email: string
  action: string
  tbl: string
  details: Record<string, unknown>
}

export interface Store {
  mode: 'demo' | 'live'
  loadAll(): Promise<DBState>
  insert<T>(table: Table, rows: object[]): Promise<T[]>
  update(table: Table, id: string, patch: object): Promise<void>
  remove(table: Table, id: string): Promise<void>
  saveSetting(key: string, value: unknown): Promise<void>
  getSetting<T>(key: string): Promise<T | null>
  searchSchemes(q: string): Promise<SchemeRow[]>
  searchStocks(q: string): Promise<StockRow[]>
  /** price points for a key on/after a date (for lumpsum buys) */
  pricesFrom(key: string, from: string): Promise<PricePoint[]>
  // users & auth
  currentUser(): Promise<AppUser | null>
  listUsers(): Promise<AppUser[]>
  updateUser(user_id: string, patch: { role?: string; perms?: Perms; display_name?: string }): Promise<void>
  removeUser(user_id: string): Promise<void>
  audit(limit: number): Promise<AuditRow[]>
  signOut(): Promise<void>
  /** demo only: wipe everything */
  reset?(): Promise<void>
  /** demo only: seed the AMFI scheme list from an Excel sheet */
  seedSchemes?(rows: SchemeRow[]): Promise<void>
  addPrices?(rows: PricePoint[]): Promise<void>
}

export const ALL_PERMS: Perms = { add: true, withdraw: true, delete: true, settings: true, holders: [] }

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
