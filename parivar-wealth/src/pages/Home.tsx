import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Empty, Gain, inr, pct, ShareBar, Stat } from '../app/ui'
import { fmtDate } from '../core/dates'
import { sumH, xirr } from '../core/valuation'
import { AdviceCard } from './Tax'

export default function Home() {
  const { d, db, visibleHolders, me } = useApp()
  const hs = d.holdings.filter((h) => visibleHolders.some((v) => v.id === h.pos.holder_id))
  if (!db.txns.length)
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Namaste, {me.display_name} 👋</h1>
        <Empty>
          No investments yet.{' '}
          <Link className="text-teal-700 underline" to="/more/import">
            Import your Excel tracker
          </Link>{' '}
          or <Link className="text-teal-700 underline" to="/invest">add your first investment</Link>.
        </Empty>
      </div>
    )
  const t = sumH(hs)
  const value = t.value
  const totalX = xirr([...t.flows, { date: d.today, amount: value }])
  const cats = new Map<string, number>()
  for (const h of hs) cats.set(h.category, (cats.get(h.category) ?? 0) + h.value)
  const catList = [...cats.entries()].sort((a, b) => b[1] - a[1])
  const sipMonthly = db.sips.filter((s) => s.active && visibleHolders.some((v) => v.id === s.holder_id)).reduce((s, x) => s + x.amount, 0)
  const top = d.advice.filter((a) => a.level !== 'good').slice(0, 3)
  const ltReady = hs.reduce((s, h) => s + (h.pos.instrument.tax_class.startsWith('equity') ? Math.max(0, h.ltGain) : 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">Family wealth</h1>
        <span className="text-xs text-slate-500">Prices as of {fmtDate(d.pricesAsOf)}</span>
      </div>

      <Card>
        <div className="text-xs text-slate-500">Value today (funds + stocks)</div>
        <div className="num text-3xl font-semibold">{inr(value)}</div>
        <div className="mt-1 text-sm">
          <Gain v={t.gain} base={t.invested} /> <span className="text-slate-500">total profit</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat label="Money put in" value={inr(t.invested, true)} />
          <Stat label="Yearly return (XIRR)" value={pct(totalX)} />
          <Stat label="Monthly SIPs" value={inr(sipMonthly, true)} sub={<Link to="/sips" className="text-teal-700">Manage →</Link>} />
        </div>
      </Card>

      <Link to="/plan" className="flex items-center justify-between rounded-xl bg-teal-700 p-4 text-white shadow-sm hover:bg-teal-800">
        <span>
          <span className="block font-semibold">Have money to invest?</span>
          <span className="text-sm text-teal-100">Answer a few questions — get a tax-smart split</span>
        </span>
        <span className="text-2xl">→</span>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        {visibleHolders.map((m) => {
          const mh = hs.filter((h) => h.pos.holder_id === m.id)
          const s = sumH(mh)
          return (
            <Link key={m.id} to={`/holdings?who=${m.id}`}>
              <Card className="hover:border-teal-300">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{m.name}</div>
                  <Badge>{mh.length} holdings</Badge>
                </div>
                <div className="num mt-1 text-xl font-semibold">{inr(s.value)}</div>
                <div className="text-sm">
                  <Gain v={s.gain} base={s.invested} short />
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      {top.length > 0 && (
        <Card title="Things to do" right={<Link to="/tax" className="text-sm text-teal-700">All tips →</Link>}>
          <div className="space-y-2">
            {top.map((a) => (
              <AdviceCard key={a.id} a={a} compact />
            ))}
          </div>
        </Card>
      )}

      <Card title="Where the money is" right={<span className="text-xs text-slate-500">share of value</span>}>
        <div className="space-y-2.5">
          {catList.map(([c, v]) => (
            <div key={c}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{c}</span>
                <span className="num text-slate-600">
                  {inr(v, true)} · {((v / value) * 100).toFixed(0)}%
                </span>
              </div>
              <ShareBar share={v / value} />
            </div>
          ))}
        </div>
      </Card>

      <Card title="Tax-free profit you can book this year">
        <p className="text-sm text-slate-600">
          Long-term equity profit already sitting in the family's holdings: <b className="num">{inr(ltReady)}</b>. Each person can book up to{' '}
          {inr(db.rules.ltcg_exemption)} of it every financial year without tax.
        </p>
        <Link to="/tax">
          <Btn variant="soft" small className="mt-3">
            See the plan
          </Btn>
        </Link>
      </Card>
    </div>
  )
}
