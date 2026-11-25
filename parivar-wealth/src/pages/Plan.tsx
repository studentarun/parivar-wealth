import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, inr, Page } from '../app/ui'
import { planInvestment, type PlanAnswers, type PlanCat } from '../core/planner'

type Step = 'amount' | 'horizon' | 'risk' | 'who' | 'prefs' | 'spread' | 'result'

function Choice<T extends string | number | boolean>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; sub?: string }[] }) {
  return (
    <div className="space-y-2">
      {options.map((o) => (
        <button
          key={String(o.v)}
          onClick={() => onChange(o.v)}
          className={`block w-full rounded-xl border p-3 text-left transition ${value === o.v ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
        >
          <div className="text-sm font-medium">{o.label}</div>
          {o.sub && <div className="text-xs text-slate-500">{o.sub}</div>}
        </button>
      ))}
    </div>
  )
}

export default function Plan() {
  const { d, db, visibleHolders } = useApp()
  const [step, setStep] = useState<Step>('amount')
  const [a, setA] = useState<PlanAnswers>({
    amount: 0,
    mode: 'sip',
    horizon: '7plus',
    risk: 'balanced',
    who: 'auto',
    international: true,
    gold: true,
    themes: false,
    stocks: false,
    emergencyReady: true,
    spreadMonths: 0,
  })
  const set = (p: Partial<PlanAnswers>) => setA({ ...a, ...p })
  const hs = d.holdings.filter((h) => visibleHolders.some((v) => v.id === h.pos.holder_id))
  const result = useMemo(() => (step === 'result' ? planInvestment(a, hs, db.holders, d.where) : null), [step, a, hs, db.holders, d.where])
  const short = a.horizon === 'lt1' || a.horizon === '1to3'
  const order: Step[] = ['amount', 'horizon', 'risk', 'who', 'prefs', ...(a.mode === 'once' && !short ? (['spread'] as Step[]) : []), 'result']
  const idx = order.indexOf(step)
  const next = () => setStep(order[Math.min(order.length - 1, idx + 1)])
  const back = () => setStep(order[Math.max(0, idx - 1)])
  const name = (id: string | null) => db.holders.find((h) => h.id === id)?.name ?? '—'

  return (
    <Page title="Invest new money" back>
      {step !== 'result' && (
        <div className="flex gap-1">
          {order.slice(0, -1).map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${i <= idx ? 'bg-teal-600' : 'bg-slate-200'}`} />
          ))}
        </div>
      )}

      {step === 'amount' && (
        <Card title="1. How do you want to invest?">
          <Choice
            value={a.mode}
            onChange={(v) => set({ mode: v })}
            options={[
              { v: 'sip', label: 'Every month (SIP)', sub: 'Steady, automatic — best for salary savings' },
              { v: 'once', label: 'One-time (lumpsum)', sub: 'Bonus, FD maturity, savings lying idle' },
            ]}
          />
          <label className="mt-4 block text-xs font-medium text-slate-600">{a.mode === 'sip' ? 'Amount per month (₹)' : 'Total amount (₹)'}</label>
          <input inputMode="numeric" value={a.amount || ''} onChange={(e) => set({ amount: Number(e.target.value.replace(/[^\d]/g, '')) })} placeholder={a.mode === 'sip' ? 'e.g. 20000' : 'e.g. 300000'} />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" className="w-auto" checked={a.emergencyReady} onChange={(e) => set({ emergencyReady: e.target.checked })} /> 6 months of expenses are already kept aside for emergencies
          </label>
          <Btn className="mt-4 w-full" disabled={a.amount < (a.mode === 'sip' ? 500 : 1000)} onClick={next}>
            Next
          </Btn>
        </Card>
      )}

      {step === 'horizon' && (
        <Card title="2. When might you need this money back?">
          <Choice
            value={a.horizon}
            onChange={(v) => set({ horizon: v })}
            options={[
              { v: 'lt1', label: 'Within 1 year', sub: 'e.g. a planned expense soon' },
              { v: '1to3', label: '1 – 3 years', sub: 'e.g. car, baby-related expenses, house down-payment' },
              { v: '3to7', label: '3 – 7 years', sub: 'e.g. building the Dehradun house' },
              { v: '7plus', label: '7+ years', sub: 'Retirement / FIRE — the long game' },
            ]}
          />
          <Nav back={back} next={next} />
        </Card>
      )}

      {step === 'risk' && (
        <Card title="3. If this money fell 30% in a bad year, what would you do?">
          <Choice
            value={a.risk}
            onChange={(v) => set({ risk: v })}
            options={[
              { v: 'steady', label: "I'd be worried and might sell", sub: 'Keep it steadier — more large-cap / index' },
              { v: 'balanced', label: "I'd hold and wait", sub: 'Balanced mix' },
              { v: 'aggressive', label: "I'd buy more", sub: 'More mid / small-cap for higher long-term growth' },
            ]}
          />
          <Nav back={back} next={next} />
        </Card>
      )}

      {step === 'who' && (
        <Card title="4. Whose account should it go in?">
          <Choice
            value={a.who}
            onChange={(v) => set({ who: v })}
            options={[
              { v: 'auto', label: 'Let the app choose (saves tax)', sub: 'Picks the account with the most tax room for each type' },
              ...visibleHolders.map((h) => ({ v: h.id, label: h.name })),
            ]}
          />
          <Nav back={back} next={next} />
        </Card>
      )}

      {step === 'prefs' && (
        <Card title="5. What are you open to?">
          <div className="space-y-2.5 text-sm">
            {(
              [
                ['international', 'International funds (US / global)', 'Spreads risk beyond India; rupee falls help returns'],
                ['gold', 'Gold / silver', 'Usually rises when stocks struggle'],
                ['themes', 'Sector / theme funds', 'Riskier bets (PSU, tech, EV…) — the family already has a lot'],
                ['stocks', 'Direct stocks', 'Needs your own research; app keeps it small'],
              ] as const
            ).map(([k, t, s]) => (
              <label key={k} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5">
                <input type="checkbox" className="mt-0.5 w-auto" checked={a[k]} onChange={(e) => set({ [k]: e.target.checked })} />
                <span>
                  <span className="font-medium">{t}</span>
                  <span className="block text-xs text-slate-500">{s}</span>
                </span>
              </label>
            ))}
          </div>
          <Nav back={back} next={next} label={order[idx + 1] === 'result' ? 'Show my plan' : 'Next'} />
        </Card>
      )}

      {step === 'spread' && (
        <Card title="6. Put it all in now, or spread it out?">
          <Choice
            value={a.spreadMonths}
            onChange={(v) => set({ spreadMonths: v })}
            options={[
              { v: 0, label: 'All at once', sub: 'Fine for smaller amounts' },
              { v: 3, label: 'Spread over 3 months' },
              { v: 6, label: 'Spread over 6 months', sub: 'Safer for big amounts — avoids buying everything on a bad day' },
            ]}
          />
          <Nav back={back} next={next} label="Show my plan" />
        </Card>
      )}

      {step === 'result' && result && (
        <>
          <Card>
            <div className="text-xs text-slate-500">Your plan for</div>
            <div className="num text-2xl font-semibold">
              {inr(a.amount)}
              {a.mode === 'sip' ? ' / month' : ' one-time'}
            </div>
            <button className="mt-1 text-sm text-teal-700" onClick={() => setStep('amount')}>
              Change answers
            </button>
          </Card>
          {result.warnings.map((w) => (
            <div key={w} className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
              ⚠ {w}
            </div>
          ))}
          <div className="space-y-2">
            {result.rows.map((r, i) => (
              <Card key={i}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="teal">{r.category}</Badge>
                      <Badge>{name(r.holder_id)}</Badge>
                      {r.fundName ? <Badge tone="green">top up</Badge> : <Badge tone="amber">new — you choose</Badge>}
                    </div>
                    <div className="mt-1.5 text-sm font-medium">{r.fundName ?? `New ${r.category} ${r.category === 'Liquid/FD' ? 'option' : 'fund'}`}</div>
                  </div>
                  <div className="num text-lg font-semibold">{inr(r.amount)}</div>
                </div>
                <p className="mt-1 text-xs text-slate-600">{r.reason}</p>
                <p className="mt-1 text-[11px] text-slate-500">🧾 {r.taxNote}</p>
                {r.category !== 'Stocks' && (
                  <Link
                    to={
                      r.instrument_id
                        ? `/invest?holder=${r.holder_id}&inst=${r.instrument_id}&mode=${a.mode}&amount=${r.amount}`
                        : `/invest?holder=${r.holder_id ?? ''}&mode=${a.mode}&amount=${r.amount}&q=${encodeURIComponent(r.search)}`
                    }
                  >
                    <Btn small className="mt-2">
                      {r.instrument_id ? (a.mode === 'sip' ? 'Start this SIP' : 'Invest this') : 'Find a fund'}
                    </Btn>
                  </Link>
                )}
              </Card>
            ))}
          </div>
          {result.notes.length > 0 && (
            <Card title="Why this split">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          )}
          {!short && (
            <Card title="Family mix: now vs plan">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-1">Type</th>
                    <th className="text-right">Now</th>
                    <th className="text-right">Plan</th>
                  </tr>
                </thead>
                <tbody className="num">
                  {[...new Set<PlanCat>([...(Object.keys(result.target) as PlanCat[]), ...result.current.map((c) => c.cat)])].map((c) => {
                    const now = result.current.find((x) => x.cat === c)?.share ?? 0
                    const t = (result.target[c] ?? 0) / 100
                    return (
                      <tr key={c} className="border-t border-slate-100">
                        <td className="py-1">{c}</td>
                        <td className={`text-right ${now > t + 0.05 ? 'text-amber-700' : now < t - 0.05 ? 'text-sky-700' : ''}`}>{Math.round(now * 100)}%</td>
                        <td className="text-right">{Math.round(t * 100)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-slate-500">Amber = more than planned (no new money goes there). Blue = less than planned (new money fills it first).</p>
            </Card>
          )}
          <p className="text-center text-[11px] text-slate-500">
            A rules-based split from your answers and your current holdings — not personalised advice from a licensed advisor. The app never picks new funds or stocks for you.
          </p>
        </>
      )}
    </Page>
  )
}

function Nav({ back, next, label = 'Next' }: { back: () => void; next: () => void; label?: string }) {
  return (
    <div className="mt-4 flex gap-2">
      <Btn variant="ghost" onClick={back}>
        Back
      </Btn>
      <Btn className="flex-1" onClick={next}>
        {label}
      </Btn>
    </div>
  )
}
