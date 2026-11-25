import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Card, Chips, Empty, Gain, inr, Page, pct } from '../app/ui'
import { sumH } from '../core/valuation'

export default function Holdings() {
  const { d, visibleHolders, holderName } = useApp()
  const [sp, setSp] = useSearchParams()
  const who = sp.get('who') ?? 'all'
  const type = sp.get('type') ?? 'all'
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    n.set(k, v)
    setSp(n, { replace: true })
  }
  const hs = d.holdings
    .filter((h) => visibleHolders.some((v) => v.id === h.pos.holder_id))
    .filter((h) => who === 'all' || h.pos.holder_id === who)
    .filter((h) => type === 'all' || (type === 'mf' ? h.pos.instrument.kind === 'MF' : h.pos.instrument.kind !== 'MF'))
    .sort((a, b) => b.value - a.value)
  const s = sumH(hs)
  return (
    <Page
      title="Holdings"
      actions={
        <div className="flex gap-2 text-sm">
          <Link className="text-teal-700" to="/sips">
            SIPs
          </Link>
          <Link className="text-teal-700" to="/history">
            History
          </Link>
        </div>
      }
    >
      <Chips value={who} onChange={(v) => set('who', v)} options={[{ v: 'all', label: 'Everyone' }, ...visibleHolders.map((h) => ({ v: h.id, label: h.name }))]} />
      <Chips
        value={type}
        onChange={(v) => set('type', v)}
        options={[
          { v: 'all', label: 'All' },
          { v: 'mf', label: 'Mutual funds' },
          { v: 'stock', label: 'Stocks & ETFs' },
        ]}
      />
      <Card>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>
            Value <b className="num">{inr(s.value)}</b>
          </span>
          <span>
            Put in <b className="num">{inr(s.invested)}</b>
          </span>
          <span>
            Profit <Gain v={s.gain} base={s.invested} />
          </span>
        </div>
      </Card>
      {!hs.length && <Empty>Nothing here yet.</Empty>}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {hs.map((h) => (
          <Link key={h.pos.holder_id + h.pos.instrument.id} to={`/h/${h.pos.holder_id}/${h.pos.instrument.id}`} className="flex items-center gap-3 p-3 hover:bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{h.pos.instrument.name}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {who === 'all' && <Badge tone="teal">{holderName(h.pos.holder_id)}</Badge>}
                <Badge>{h.category}</Badge>
                {!h.pos.instrument.keep && <Badge tone="amber">Exit</Badge>}
                {h.price == null && <Badge tone="red">no price</Badge>}
                <span>XIRR {pct(h.xirr)}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="num text-sm font-semibold">{inr(h.value)}</div>
              <div className="text-xs">
                <Gain v={h.gain} base={h.invested} short />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Page>
  )
}
