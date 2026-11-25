import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Card, Chips, Gain, inr, Page, units } from '../app/ui'
import { fmtDate, fyLabel, fyOf } from '../core/dates'

/** All transactions + realised profit, per financial year (handy for the tax return). */
export default function History() {
  const { db, d, visibleHolders, holderName } = useApp()
  const vis = new Set(visibleHolders.map((h) => h.id))
  const fys = [...new Set(db.txns.map((t) => fyOf(t.date)))].sort((a, b) => b - a)
  const [fy, setFy] = useState(String(fys[0] ?? d.fy))
  const name = (id: string) => db.instruments.find((i) => i.id === id)?.name ?? '?'
  const txns = db.txns.filter((t) => vis.has(t.holder_id) && fyOf(t.date) === Number(fy)).sort((a, b) => b.date.localeCompare(a.date))
  const realised = d.positions.filter((p) => vis.has(p.holder_id)).flatMap((p) => p.realised.filter((r) => fyOf(r.sell_date) === Number(fy)))
  const sumBy = (f: (r: (typeof realised)[number]) => boolean) => realised.filter(f).reduce((s, r) => s + r.gain, 0)
  return (
    <Page title="History" back>
      <Chips value={fy} onChange={setFy} options={fys.map((f) => ({ v: String(f), label: fyLabel(f) }))} />
      {realised.length > 0 && (
        <Card title={`Profit booked in ${fyLabel(Number(fy))} (for the tax return)`}>
          <div className="space-y-1 text-sm">
            {visibleHolders.map((h) => {
              const mine = realised.filter((r) => r.holder_id === h.id)
              if (!mine.length) return null
              const eqLT = mine.filter((r) => r.term === 'LT' && r.tax_class.startsWith('equity')).reduce((s, r) => s + r.gain, 0)
              const eqST = mine.filter((r) => r.term === 'ST' && !r.slab).reduce((s, r) => s + r.gain, 0)
              const other = mine.filter((r) => r.slab || (r.term === 'LT' && !r.tax_class.startsWith('equity'))).reduce((s, r) => s + r.gain, 0)
              return (
                <div key={h.id} className="flex flex-wrap justify-between gap-2">
                  <b>{h.name}</b>
                  <span className="text-xs">
                    Equity long-term <Gain v={eqLT} /> · short-term <Gain v={eqST} /> · other <Gain v={other} />
                  </span>
                </div>
              )
            })}
            <div className="pt-1 text-xs text-slate-500">Total: <Gain v={sumBy(() => true)} /></div>
          </div>
        </Card>
      )}
      <Card title={`${txns.length} entries`}>
        <div className="divide-y divide-slate-100 text-sm">
          {txns.slice(0, 400).map((t) => (
            <Link to={`/h/${t.holder_id}/${t.instrument_id}`} key={t.id} className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50">
              <div className="min-w-0">
                <div className="truncate">{name(t.instrument_id)}</div>
                <div className="text-xs text-slate-500">
                  {fmtDate(t.date)} · {holderName(t.holder_id)} · <Badge tone={t.type === 'BUY' ? 'green' : 'blue'}>{t.type === 'BUY' ? 'Bought' : 'Sold'}</Badge>{' '}
                  {t.source === 'sip' && <Badge>SIP</Badge>} {t.status === 'pending' && <Badge tone="amber">waiting</Badge>}
                  {t.units ? ` ${units(t.units)} @ ${t.price}` : ''}
                </div>
              </div>
              <span className="num">{inr(t.amount ?? (t.units ?? 0) * (t.price ?? 0))}</span>
            </Link>
          ))}
        </div>
      </Card>
    </Page>
  )
}
