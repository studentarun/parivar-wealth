import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildAdvice, whereToInvest, type Advice } from '../core/advice'
import { fyOf, todayIST } from '../core/dates'
import { buildPositions, type Position } from '../core/lots'
import { PriceBook } from '../core/prices'
import { DEFAULT_RULES } from '../core/rules'
import { fillPending, runSips } from '../core/sip'
import { personYears, type PersonYear } from '../core/tax'
import type { AppUser, DBState, Holder } from '../core/types'
import { valueAsset, type Asset, type Valuation } from '../core/assets'
import { valueHoldings, type Holding } from '../core/valuation'
import type { Store } from '../data/store'

export interface Derived {
  today: string
  fy: number
  book: PriceBook
  positions: Position[]
  holdings: Holding[]
  years: PersonYear[]
  advice: Advice[]
  where: ReturnType<typeof whereToInvest>
  pricesAsOf: string | null
  assets: { a: Asset; v: Valuation }[]
}

interface Ctx {
  store: Store
  me: AppUser
  db: DBState
  d: Derived
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  holderName: (id: string) => string
  visibleHolders: Holder[]
  can: (p: 'add' | 'withdraw' | 'delete' | 'settings') => boolean
  toast: (msg: string) => void
}

const C = createContext<Ctx | null>(null)
export const useApp = () => {
  const c = useContext(C)
  if (!c) throw new Error('no app context')
  return c
}

const EMPTY: DBState = { holders: [], instruments: [], txns: [], sips: [], prices: [], rules: DEFAULT_RULES, assets: [], metal: null }

export function derive(db: DBState, today = todayIST()): Derived {
  const book = new PriceBook(db.prices)
  const positions = buildPositions(db.txns, db.instruments, db.rules)
  const holdings = valueHoldings(positions, book, today, db.rules)
  const fy = fyOf(today)
  const years = personYears(positions, db.holders, fy, db.rules)
  const advice = buildAdvice({ holdings, holders: db.holders, years, sips: db.sips, txns: db.txns, rules: db.rules, today })
  const where = whereToInvest(years, holdings, db.rules)
  const pricesAsOf = holdings.map((h) => h.priceDate).filter(Boolean).sort().pop() ?? null
  const assets = db.assets.filter((a) => a.active).map((a) => ({ a, v: valueAsset(a, today, db.metal) }))
  return { today, fy, book, positions, holdings, years, advice, where, pricesAsOf, assets }
}

export function AppProvider({ store, me, children }: { store: Store; me: AppUser; children: ReactNode }) {
  const [db, setDb] = useState<DBState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setError(null)
      let s = await store.loadAll()
      if (store.mode === 'demo') {
        // In demo mode the browser does the nightly job's work: SIP instalments + pending orders.
        const book = new PriceBook(s.prices)
        const today = todayIST()
        const run = runSips(s.sips, s.instruments, book, today, s.rules)
        const fills = fillPending(s.txns, s.instruments, book, today, s.rules)
        if (run.newTxns.length || fills.length) {
          if (run.newTxns.length) await store.insert('txns', run.newTxns)
          for (const u of run.sipUpdates) await store.update('sips', u.id, { last_run_date: u.last_run_date })
          for (const f of fills) await store.update('txns', f.id, f.patch)
          s = await store.loadAll()
        }
      }
      setDb(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    reload()
  }, [reload])

  const d = useMemo(() => derive(db), [db])
  const toast = useCallback((m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(null), 3500)
  }, [])

  const value: Ctx = {
    store,
    me,
    db,
    d,
    loading,
    error,
    reload,
    toast,
    holderName: (id) => db.holders.find((h) => h.id === id)?.name ?? '—',
    visibleHolders: me.role === 'admin' || !me.perms.holders.length ? db.holders : db.holders.filter((h) => me.perms.holders.includes(h.id)),
    can: (p) => me.role === 'admin' || (me.role === 'member' && !!me.perms[p]),
  }
  return (
    <C.Provider value={value}>
      {children}
      {msg && (
        <div className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg md:bottom-6">{msg}</div>
      )}
    </C.Provider>
  )
}
