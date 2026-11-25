import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Field, Gain, inr, Page, ShareBar, units } from '../app/ui'
import type { Advice } from '../core/advice'
import { fmtDate, fyEnd, fyLabel } from '../core/dates'

const TONE = { act: 'border-l-teal-600', warn: 'border-l-amber-500', info: 'border-l-sky-400', good: 'border-l-emerald-500' }
const TAG = { act: ['Do this', 'teal'], warn: ['Careful', 'amber'], info: ['Good to know', 'blue'], good: ['All good', 'green'] } as const

export function AdviceCard({ a, compact }: { a: Advice; compact?: boolean }) {
  const { holderName } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-lg border border-slate-200 border-l-4 bg-white p-3 ${TONE[a.level]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{a.title}</div>
        <Badge tone={TAG[a.level][1]}>{TAG[a.level][0]}</Badge>
      </div>
      {!compact && <p className="mt-1 text-sm text-slate-600">{a.body}</p>}
      {a.saving != null && a.saving > 1 && (
        <div className="mt-1 text-xs text-emerald-700">
          Tax saved / avoided: <b>{inr(a.saving)}</b>
        </div>
      )}
      {!compact && a.plan && a.plan.length > 0 && (
        <div className="mt-2">
          <button className="text-xs text-teal-700" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Show'} exactly what to sell ({a.plan.length})
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th className="py-1">Fund</th>
                    <th>Whose</th>
                    <th>Units</th>
                    <th>≈ Value</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {a.plan.map((p) => (
                    <tr key={p.holder_id + p.instrument_id} className="border-t border-slate-100">
                      <td className="py-1 pr-2">
                        <Link className="text-teal-700" to={`/h/${p.holder_id}/${p.instrument_id}`}>
                          {p.name}
                        </Link>
                      </td>
                      <td>{holderName(p.holder_id)}</td>
                      <td>{units(p.units)}</td>
                      <td>{inr(p.value)}</td>
                      <td>{inr(p.gain)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[11px] text-slate-500">Sell by units on your broker app, then reinvest the money the same or next day. Record both here (Withdraw + Invest).</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Tax() {
  const { d, db } = useApp()
  const r = db.rules
  const month = Number(d.today.slice(5, 7))
  const stale = month >= 2 && month <= 4 && r.last_reviewed < `${d.today.slice(0, 4)}-02-01`
  return (
    <Page title="Tax tips">
      <p className="text-sm text-slate-600">
        {fyLabel(d.fy)} · ends {fmtDate(fyEnd(d.fy))}. Rules: <b>{r.version}</b> (checked {fmtDate(r.last_reviewed)}).{' '}
        <Link className="text-teal-700" to="/more/rules">
          View rules
        </Link>
      </p>
      {stale && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Budget season: check whether tax rates or limits changed and update <Link className="underline" to="/more/rules">Tax rules</Link>.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {d.years.map((y) => {
          const used = r.ltcg_exemption - y.exemptionLeft
          return (
            <Card key={y.person.id} title={y.members.map((m) => m.name).join(' + ')} right={y.members.length > 1 ? <Badge tone="amber">clubbed</Badge> : null}>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>₹1.25L tax-free limit used</span>
                <span className="num">
                  {inr(used)} / {inr(r.ltcg_exemption)}
                </span>
              </div>
              <ShareBar share={used / r.ltcg_exemption} />
              <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                <span className="text-slate-500">Long-term equity profit booked</span>
                <span className="text-right">
                  <Gain v={y.gains.eqLT} />
                </span>
                <span className="text-slate-500">Short-term profit booked</span>
                <span className="text-right">
                  <Gain v={y.gains.eqST + y.gains.slab} />
                </span>
                <span className="text-slate-500">Est. tax on all income this year</span>
                <span className="num text-right font-medium">{inr(y.tax.total)}</span>
                {y.shortfallLeft > 0 && (
                  <>
                    <span className="text-slate-500">Extra tax-free room (low income)</span>
                    <span className="num text-right text-emerald-700">{inr(y.shortfallLeft)}</span>
                  </>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <div className="space-y-2">
        {d.advice.map((a) => (
          <AdviceCard key={a.id} a={a} />
        ))}
      </div>

      <Card title="Where to invest next (to pay less tax later)">
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ['Indian equity funds & stocks', d.where.equity],
              ['International funds, gold, FDs, debt', d.where.other],
            ] as const
          ).map(([label, list]) => (
            <div key={label}>
              <div className="mb-2 text-xs font-semibold text-slate-600">{label}</div>
              <ol className="space-y-2 text-sm">
                {list.map((x, i) => (
                  <li key={x.person.id}>
                    <b>
                      {i + 1}. {x.person.name}
                    </b>{' '}
                    {i === 0 && <Badge tone="green">best</Badge>}
                    <div className="text-xs text-slate-600">{x.reason}</div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Based on each person's yearly income (set in More → Family). Money you give your spouse is "clubbed" — its profit is taxed in your hands. Gifts to parents are not clubbed.
        </p>
      </Card>

      <AskAI />
      <p className="text-center text-[11px] text-slate-500">Estimates only — not tax advice. Confirm big decisions with a CA.</p>
    </Page>
  )
}

function AskAI() {
  const { d, db } = useApp()
  const [key, setKey] = useState(() => localStorage.getItem('pw-gemini-key') ?? '')
  const [model, setModel] = useState(() => localStorage.getItem('pw-gemini-model') ?? 'gemini-2.5-flash')
  const [q, setQ] = useState('')
  const [ans, setAns] = useState('')
  const [busy, setBusy] = useState(false)
  const ask = async () => {
    setBusy(true)
    setAns('')
    localStorage.setItem('pw-gemini-key', key)
    localStorage.setItem('pw-gemini-model', model)
    const summary = {
      today: d.today,
      rules: db.rules,
      people: d.years.map((y) => ({ name: y.person.name, other_income: y.person.other_income, clubbed_members: y.members.map((m) => m.name), gains_this_fy: y.gains, exemption_left: y.exemptionLeft })),
      holdings: d.holdings.map((h) => ({ who: db.holders.find((x) => x.id === h.pos.holder_id)?.name, fund: h.pos.instrument.name, category: h.category, value: Math.round(h.value), profit: Math.round(h.gain), long_term_profit: Math.round(h.ltGain) })),
      app_advice: d.advice.map((a) => a.title),
    }
    const prompt = `You are helping an Indian family understand their investments and Indian income tax (new regime). Explain simply, in short points, with rupee examples. Use the rules given (they are the family's current understanding; mention if something may have changed and must be confirmed with a CA). Don't recommend specific stocks.\n\nFamily data (JSON): ${JSON.stringify(summary)}\n\nQuestion: ${q}`
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      })
      const j = await res.json()
      setAns(j.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') || j.error?.message || 'No answer')
    } catch (e) {
      setAns('Error: ' + String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card title="Ask AI (optional)" right={<Badge>uses your free Gemini key</Badge>}>
      <div className="space-y-2">
        {!key && (
          <p className="text-xs text-slate-600">
            Get a free key at aistudio.google.com → "Get API key". It's stored only on this device. Your holdings summary (names, amounts) is sent to Google to answer.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Field label="Gemini API key">
              <input type="password" value={key} onChange={(e) => setKey(e.target.value.trim())} />
            </Field>
          </div>
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value.trim())} />
          </Field>
        </div>
        <textarea rows={2} placeholder="e.g. Should Maa sell her PSU fund this year? Explain the tax." value={q} onChange={(e) => setQ(e.target.value)} />
        <Btn small disabled={!key || !q || busy} onClick={ask}>
          {busy ? 'Thinking…' : 'Ask'}
        </Btn>
        {ans && <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{ans}</div>}
      </div>
    </Card>
  )
}
