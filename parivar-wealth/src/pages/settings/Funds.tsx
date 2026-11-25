import { useApp } from '../../app/state'
import { Badge, Card, inr, Page } from '../../app/ui'
import type { Category, Instrument, TaxClass } from '../../core/types'

const CATS: Category[] = ['Large/Index', 'Flexi/Multi', 'Mid', 'Small', 'Sector/Theme', 'ELSS', 'International', 'Gold/Silver', 'Debt', 'Stocks', 'Other']
const TAX: { v: TaxClass; label: string }[] = [
  { v: 'equity', label: 'Indian equity (1 yr → long-term)' },
  { v: 'equity_elss', label: 'ELSS (3-yr lock)' },
  { v: 'intl_fof', label: 'International / other fund-of-fund (2 yrs)' },
  { v: 'listed_nonequity', label: 'Gold/silver/intl ETF on NSE (1 yr)' },
  { v: 'debt', label: 'Debt fund (always slab)' },
]

export default function Funds() {
  const { db, d, can, store, reload, toast } = useApp()
  const edit = can('settings')
  const held = new Map<string, number>()
  for (const h of d.holdings) held.set(h.pos.instrument.id, (held.get(h.pos.instrument.id) ?? 0) + h.value)
  const list = [...db.instruments].filter((i) => held.has(i.id)).sort((a, b) => a.category.localeCompare(b.category) || (held.get(b.id) ?? 0) - (held.get(a.id) ?? 0))
  const save = async (i: Instrument, p: Partial<Instrument>) => {
    await store.update('instruments', i.id, p)
    toast('Saved')
    reload()
  }
  return (
    <Page title="Funds & stocks" back>
      <p className="text-sm text-slate-600">
        Mark funds you want to get out of as <b>Exit</b>. The tax planner will use them first for tax-free profit booking, and warn you if a SIP is still running into them.
      </p>
      {list.map((i) => (
        <Card key={i.id}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{i.name}</div>
              <div className="text-xs text-slate-500">
                {i.kind === 'MF' ? `AMFI ${i.code}` : `NSE ${i.code}`} · family holds {inr(held.get(i.id) ?? 0, true)}
              </div>
            </div>
            <div className="flex gap-1">
              <button disabled={!edit} onClick={() => save(i, { keep: true })}>
                <Badge tone={i.keep ? 'green' : 'slate'}>Keep</Badge>
              </button>
              <button disabled={!edit} onClick={() => save(i, { keep: false })}>
                <Badge tone={!i.keep ? 'amber' : 'slate'}>Exit</Badge>
              </button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <select disabled={!edit} value={i.category} onChange={(e) => save(i, { category: e.target.value as Category })}>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select className="sm:col-span-2" disabled={!edit} value={i.tax_class} onChange={(e) => save(i, { tax_class: e.target.value as TaxClass })}>
              {TAX.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1 text-xs">
              <input
                disabled={!edit}
                className="w-14"
                defaultValue={i.exit_load_pct}
                onBlur={(e) => Number(e.target.value) !== i.exit_load_pct && save(i, { exit_load_pct: Number(e.target.value) || 0 })}
              />
              % exit load if sold within
              <input
                disabled={!edit}
                className="w-16"
                defaultValue={i.exit_load_days}
                onBlur={(e) => Number(e.target.value) !== i.exit_load_days && save(i, { exit_load_days: Number(e.target.value) || 0 })}
              />
              days
            </div>
          </div>
        </Card>
      ))}
    </Page>
  )
}
