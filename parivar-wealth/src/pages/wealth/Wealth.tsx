import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Badge, Btn, Card, Chips, Empty, Gain, inr, Page, ShareBar } from '../../app/ui'
import { ASSET_TYPES } from '../../core/assets'
import { sumH } from '../../core/valuation'

export function useNetWorth(who = 'all') {
  const { d, visibleHolders } = useApp()
  const vis = new Set(visibleHolders.map((h) => h.id))
  const inScope = (hid: string | null) => (who === 'all' ? hid == null || vis.has(hid) : hid === who)
  const hs = d.holdings.filter((h) => inScope(h.pos.holder_id))
  const funds = sumH(hs)
  const items = d.assets.filter((x) => inScope(x.a.holder_id))
  const byType = new Map<string, number>()
  for (const x of items) if (x.a.type !== 'insurance') byType.set(x.a.type, (byType.get(x.a.type) ?? 0) + x.v.value)
  const assetsTotal = [...byType.entries()].filter(([t]) => t !== 'loan').reduce((s, [, v]) => s + v, 0)
  const loans = byType.get('loan') ?? 0
  return { funds, items, byType, assetsTotal, loans, net: funds.value + assetsTotal + loans }
}

export default function Wealth() {
  const { visibleHolders, holderName, can, db } = useApp()
  const [who, setWho] = useState('all')
  const nw = useNetWorth(who)
  const gross = nw.funds.value + nw.assetsTotal
  const rows: [string, string, number][] = [
    ['📈', 'Mutual funds & stocks', nw.funds.value],
    ...ASSET_TYPES.filter((t) => t.v !== 'loan' && t.v !== 'insurance' && nw.byType.get(t.v)).map((t) => [t.icon, t.label, nw.byType.get(t.v)!] as [string, string, number]),
  ]
  const alerts = nw.items.flatMap((x) => x.v.alerts.map((al) => ({ ...al, x })))
  return (
    <Page title="Wealth" actions={can('add') && <Link to="/wealth/new"><Btn small>+ Add</Btn></Link>}>
      <Chips value={who} onChange={setWho} options={[{ v: 'all', label: 'Whole family' }, ...visibleHolders.map((h) => ({ v: h.id, label: h.name }))]} />
      <Card>
        <div className="text-xs text-slate-500">Net worth (everything owned − loans)</div>
        <div className="num text-3xl font-semibold">{inr(nw.net)}</div>
        {nw.loans < 0 && (
          <div className="text-sm text-slate-600">
            Owned {inr(gross, true)} · Loans <span className="text-rose-700">{inr(nw.loans, true)}</span>
          </div>
        )}
        <div className="mt-4 space-y-2.5">
          {rows
            .sort((a, b) => b[2] - a[2])
            .map(([icon, label, v]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>
                    {icon} {label}
                  </span>
                  <span className="num text-slate-600">
                    {inr(v, true)} · {gross ? Math.round((v / gross) * 100) : 0}%
                  </span>
                </div>
                <ShareBar share={gross ? v / gross : 0} />
              </div>
            ))}
        </div>
      </Card>

      {alerts.length > 0 && (
        <Card title="Reminders">
          <div className="space-y-1.5 text-sm">
            {alerts.map((al, i) => (
              <Link key={i} to={`/wealth/${al.x.a.id}`} className="flex items-start gap-2">
                <Badge tone={al.level === 'warn' ? 'amber' : 'blue'}>{al.level === 'warn' ? 'Soon' : 'Note'}</Badge>
                <span>
                  <b>{al.x.a.name}</b> — {al.text}
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {!nw.items.length && (
        <Empty>
          Add FDs, gold, property, EPF/PPF, loans… to see your full net worth.{' '}
          {can('add') && (
            <Link className="text-teal-700 underline" to="/wealth/new">
              Add the first one
            </Link>
          )}
        </Empty>
      )}

      {ASSET_TYPES.map((t) => {
        const list = nw.items.filter((x) => x.a.type === t.v)
        if (!list.length) return null
        return (
          <Card key={t.v} title={`${t.icon} ${t.label}`} right={<span className="num text-sm text-slate-600">{t.v === 'insurance' ? `${list.length} policies` : inr(list.reduce((s, x) => s + x.v.value, 0), true)}</span>}>
            <div className="divide-y divide-slate-100">
              {list.map(({ a, v }) => (
                <Link key={a.id} to={`/wealth/${a.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                  {a.photos?.length ? <span className="text-xs text-slate-400">📷{a.photos.length}</span> : null}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="flex flex-wrap gap-1.5 text-xs text-slate-500">
                      <Badge tone="teal">{a.holder_id ? holderName(a.holder_id) : 'Family / joint'}</Badge>
                      {v.share < 1 && <Badge>{Math.round(v.share * 100)}% share</Badge>}
                      {v.alerts.map((al, i) => (
                        <Badge key={i} tone={al.level === 'warn' ? 'amber' : 'blue'}>
                          {al.text}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`num text-sm font-semibold ${v.value < 0 ? 'text-rose-700' : ''}`}>{t.v === 'insurance' ? inr(Number(a.details.cover ?? 0), true) + ' cover' : inr(v.value)}</div>
                    {v.cost ? (
                      <div className="text-xs">
                        <Gain v={v.value - v.cost} base={v.cost} short />
                      </div>
                    ) : v.income ? (
                      <div className="text-xs text-slate-500">{inr(v.income.yearly, true)}/yr</div>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        )
      })}
      <p className="text-center text-[11px] text-slate-500">
        Gold/silver at IBJA rates ({db.metal ? db.metal.date : 'not set'}) · property and other values are estimates from what you enter.{' '}
        <Link className="text-teal-700 underline" to="/more/metals">
          Metal rates
        </Link>
      </p>
    </Page>
  )
}
