import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Gain, inr, Page, pct, Stat, units } from '../app/ui'
import { daysBetween, fmtDate } from '../core/dates'
import { ltDate, unlockDate } from '../core/lots'

export default function HoldingDetail() {
  const { holder, inst } = useParams()
  const { d, db, holderName, can, store, reload, toast } = useApp()
  const nav = useNavigate()
  const h = d.holdings.find((x) => x.pos.holder_id === holder && x.pos.instrument.id === inst)
  const pos = h?.pos ?? d.positions.find((p) => p.holder_id === holder && p.instrument.id === inst)
  if (!pos) return <Page title="Not found" back>Nothing here.</Page>
  const i = pos.instrument
  const r = db.rules
  const sips = db.sips.filter((s) => s.holder_id === holder && s.instrument_id === inst)
  const price = h?.price ?? null

  const del = async (id: string) => {
    if (!confirm('Delete this entry? This cannot be undone.')) return
    await store.remove('txns', id)
    toast('Entry deleted')
    reload()
  }

  return (
    <Page title={i.name} back>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="teal">{holderName(pos.holder_id)}</Badge>
        <Badge>{i.category}</Badge>
        <Badge tone="blue">{i.kind === 'MF' ? `AMFI ${i.code}` : `NSE ${i.code}`}</Badge>
        {!i.keep && <Badge tone="amber">Marked to exit</Badge>}
      </div>
      {h && (
        <Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Value today" value={inr(h.value)} sub={<span className="text-slate-500">{price != null ? `@ ${price} on ${fmtDate(h.priceDate)}` : 'no price yet'}</span>} />
            <Stat label="Money put in" value={inr(h.invested)} sub={<span className="text-slate-500">{units(h.units)} units</span>} />
            <Stat label="Profit" value={<Gain v={h.gain} base={h.invested} />} sub={<span className="text-slate-500">XIRR {pct(h.xirr)}</span>} />
            <Stat
              label="Long-term profit"
              value={<Gain v={h.ltGain} />}
              sub={<span className="text-slate-500">short-term {inr(h.stGain)}</span>}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {can('add') && (
              <Btn onClick={() => nav(`/invest?holder=${pos.holder_id}&inst=${i.id}`)}>Invest more</Btn>
            )}
            {can('add') && (
              <Btn variant="soft" onClick={() => nav(`/invest?holder=${pos.holder_id}&inst=${i.id}&mode=sip`)}>
                Start SIP
              </Btn>
            )}
            {can('withdraw') && (
              <Btn variant="ghost" onClick={() => nav(`/withdraw/${pos.holder_id}/${i.id}`)}>
                Withdraw
              </Btn>
            )}
          </div>
        </Card>
      )}

      {sips.length > 0 && (
        <Card title="SIPs" right={<Link className="text-sm text-teal-700" to="/sips">Manage →</Link>}>
          {sips.map((s) => (
            <div key={s.id} className="flex justify-between text-sm">
              <span>
                {inr(s.amount)} on day {s.day} every month
              </span>
              <Badge tone={s.active ? 'green' : 'slate'}>{s.active ? 'Running' : 'Paused'}</Badge>
            </div>
          ))}
        </Card>
      )}

      {h && h.pos.lots.length > 0 && (
        <Card title="Your units, oldest first (sold in this order)">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1">Bought</th>
                  <th>Units</th>
                  <th>Cost</th>
                  <th>Profit</th>
                  <th>Tax status</th>
                </tr>
              </thead>
              <tbody className="num">
                {h.pos.lots.map((l) => {
                  const lt = ltDate(l.date, i.tax_class, r)
                  const unlock = unlockDate(l.date, i.tax_class, r)
                  const g = price != null ? l.units * (price - l.cost_per_unit) : 0
                  const isLT = lt != null && d.today >= lt
                  return (
                    <tr key={l.txn_id} className="border-t border-slate-100">
                      <td className="py-1.5">{fmtDate(l.date)}</td>
                      <td>{units(l.units)}</td>
                      <td>{inr(l.units * l.cost_per_unit)}</td>
                      <td>
                        <Gain v={g} />
                      </td>
                      <td>
                        {unlock && d.today < unlock ? (
                          <Badge tone="red">Locked till {fmtDate(unlock)}</Badge>
                        ) : lt == null ? (
                          <Badge tone="amber">Slab rate</Badge>
                        ) : isLT ? (
                          <Badge tone="green">Long-term</Badge>
                        ) : (
                          <Badge tone="amber">Long-term in {daysBetween(d.today, lt)}d</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="All entries">
        <div className="divide-y divide-slate-100 text-sm">
          {[...pos.txns].reverse().map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <div>
                  <Badge tone={t.type === 'BUY' ? 'green' : 'blue'}>{t.type === 'BUY' ? 'Bought' : 'Sold'}</Badge>{' '}
                  {t.status === 'pending' && <Badge tone="amber">waiting for price</Badge>} {t.source === 'sip' && <Badge>SIP</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fmtDate(t.date)}
                  {t.units ? ` · ${units(t.units)} @ ${t.price}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="num">{inr(t.amount ?? (t.units ?? 0) * (t.price ?? 0))}</span>
                {can('delete') && (
                  <button className="text-xs text-rose-600" onClick={() => del(t.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  )
}
