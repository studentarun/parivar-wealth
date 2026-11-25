import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../app/state'
import { Card, Chips, inr, Page, pct, Stat } from '../app/ui'
import { PriceBook } from '../core/prices'
import { monthlySeries } from '../core/trends'
import type { PricePoint } from '../core/types'

// Validated categorical palette (dataviz reference, light mode), fixed order
const S = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17']
const AXIS = { fontSize: 11, fill: '#666666' }
const short = (v: number) => inr(v, true)

function Tip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-600">{p.name}</span>
          <span className="num ml-auto pl-3 font-medium">{inr(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function Trends() {
  const { db, d, store, visibleHolders } = useApp()
  const [prices, setPrices] = useState<PricePoint[] | null>(null)
  const [who, setWho] = useState('all')
  const [range, setRange] = useState<'12' | '36' | '60' | 'all'>('36')
  const [split, setSplit] = useState<'type' | 'person'>('type')
  const [table, setTable] = useState(false)

  useEffect(() => {
    store.allPrices().then(setPrices).catch(() => setPrices(db.prices))
  }, [store, db.prices])

  const holders = who === 'all' ? visibleHolders : visibleHolders.filter((h) => h.id === who)
  const series = useMemo(() => {
    if (!prices) return []
    const ids = new Set(holders.map((h) => h.id))
    const txns = db.txns.filter((t) => ids.has(t.holder_id))
    return monthlySeries(txns, db.instruments, new PriceBook(prices), db.rules, d.today)
  }, [prices, holders, db.txns, db.instruments, db.rules, d.today])

  const shown = range === 'all' ? series : series.slice(-Number(range))
  const data = shown.map((p) => ({
    label: p.label,
    'Money put in': Math.round(p.invested),
    Value: Math.round(p.value),
    'SIP / regular': Math.round(p.regular),
    'One-time': Math.round(p.oneTime),
    ...Object.fromEntries(holders.map((h) => [h.name, Math.round(p.byHolder[h.id] ?? 0)])),
  }))
  const last = series[series.length - 1]
  const prevFull = series[series.length - 2]
  const yearAgo = series[series.length - 14]
  const growth12 = last && series.length > 12 ? last.value - series[series.length - 13].value : null

  return (
    <Page title="Trends">
      <Chips value={who} onChange={setWho} options={[{ v: 'all', label: 'Everyone' }, ...visibleHolders.map((h) => ({ v: h.id, label: h.name }))]} />
      <Chips
        value={range}
        onChange={setRange}
        options={[
          { v: '12', label: '1 year' },
          { v: '36', label: '3 years' },
          { v: '60', label: '5 years' },
          { v: 'all', label: 'All' },
        ]}
      />
      {!prices ? (
        <div className="p-8 text-center text-slate-500">Loading price history…</div>
      ) : !series.length ? (
        <div className="p-8 text-center text-slate-500">No investments yet.</div>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Monthly SIP (last full month)" value={inr(prevFull?.regular ?? 0)} sub={yearAgo ? <span className="text-slate-500">a year before: {inr(yearAgo.regular)}</span> : null} />
              <Stat label="Value today" value={inr(last.value, true)} />
              <Stat label="Money put in" value={inr(last.invested, true)} />
              <Stat label="Value change, 12 months" value={growth12 != null ? inr(growth12, true) : '—'} sub={growth12 != null ? <span className="text-slate-500">incl. new money</span> : null} />
            </div>
          </Card>

          <Card title="Money put in vs value" right={<button className="text-xs text-teal-700" onClick={() => setTable(!table)}>{table ? 'Show charts' : 'Show as table'}</button>}>
            {table ? (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white text-left text-slate-500">
                    <tr>
                      <th className="py-1">Month</th>
                      <th className="text-right">Put in</th>
                      <th className="text-right">Value</th>
                      <th className="text-right">Profit</th>
                      <th className="text-right">SIP</th>
                      <th className="text-right">One-time</th>
                    </tr>
                  </thead>
                  <tbody className="num">
                    {[...shown].reverse().map((p) => (
                      <tr key={p.month} className="border-t border-slate-100">
                        <td className="py-1">{p.label}</td>
                        <td className="text-right">{inr(p.invested)}</td>
                        <td className="text-right">{inr(p.value)}</td>
                        <td className="text-right">{pct(p.invested ? (p.value - p.invested) / p.invested : null)}</td>
                        <td className="text-right">{inr(p.regular)}</td>
                        <td className="text-right">{inr(p.oneTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
                    <Tooltip content={<Tip />} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Value" stroke={S[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                    <Line type="monotone" dataKey="Money put in" stroke={S[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              Value uses AMFI NAVs / NSE closes stored for each month end. Where no price was stored yet for an older month, the last buy price is used — this fills in after a few nightly runs.
            </p>
          </Card>

          {!table && (
            <Card title="Money invested each month">
              <div className="mb-2">
                <Chips
                  value={split}
                  onChange={setSplit}
                  options={[
                    { v: 'type', label: 'SIP vs one-time' },
                    { v: 'person', label: 'By person' },
                  ]}
                />
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
                    <Tooltip content={<Tip />} cursor={{ fill: '#f1f5f9' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {split === 'type' ? (
                      <>
                        <Bar dataKey="SIP / regular" stackId="a" fill={S[0]} stroke="#fff" strokeWidth={1} />
                        <Bar dataKey="One-time" stackId="a" fill={S[1]} stroke="#fff" strokeWidth={1} radius={[3, 3, 0, 0]} />
                      </>
                    ) : (
                      holders.map((h, i) => (
                        <Bar key={h.id} dataKey={h.name} stackId="a" fill={S[i % S.length]} stroke="#fff" strokeWidth={1} radius={i === holders.length - 1 ? [3, 3, 0, 0] : undefined} />
                      ))
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {!table && (
            <Card title="How the monthly SIP has grown">
              <div className="h-52">
                <ResponsiveContainer>
                  <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#eef0f3" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
                    <Tooltip content={<Tip />} />
                    <Line type="stepAfter" dataKey="SIP / regular" stroke={S[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">"Regular" = SIP instalments plus repeat monthly buys of a similar amount (how your Excel history is recognised).</p>
            </Card>
          )}
        </>
      )}
    </Page>
  )
}
