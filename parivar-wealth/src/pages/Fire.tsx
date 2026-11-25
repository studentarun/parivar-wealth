import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Field, inr, Page, Stat } from '../app/ui'
import { ASSET_TYPES, type AssetType } from '../core/assets'
import { corpusNeeded, earliestRetireAge, lastsTill, simulate, sipNeeded, type FirePlan, type Goal } from '../core/fire'
import { uid } from '../data/store'

interface Saved {
  plan: FirePlan
  holders: string[]
  include: Record<string, boolean>
  extraSip: number
  extraPassive: number
  autoSip: boolean
  autoPassive: boolean
}

const DEFAULT_PLAN: FirePlan = {
  age: 35,
  retireAge: 50,
  lifeAge: 85,
  monthlyExpense: 50000,
  retireExpensePct: 90,
  inflation: 6,
  preReturn: 11,
  postReturn: 8,
  sipMonthly: 0,
  sipStepUp: 10,
  passiveMonthly: 0,
  passiveGrowth: 5,
  goals: [],
}
const DEFAULT_INCLUDE: Record<string, boolean> = { funds: true, fd: true, epf: true, ppf: true, nps: true, cash: true, sgb: true, gold: false, silver: false, diamond: false, property: false, vehicle: false, other: false, loan: true }

const S = ['#257de0', '#f47230']
const AXIS = { fontSize: 11, fill: '#666666' }

function Num({ label, value, onChange, hint, suffix }: { label: string; value: number; onChange: (v: number) => void; hint?: string; suffix?: string }) {
  return (
    <Field label={label + (suffix ? ` (${suffix})` : '')} hint={hint}>
      <input inputMode="decimal" value={Number.isFinite(value) ? String(value) : ''} onChange={(e) => onChange(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
    </Field>
  )
}

export default function Fire() {
  const { d, db, store, visibleHolders, can, toast } = useApp()
  const thisYear = Number(d.today.slice(0, 4))
  const [s, setS] = useState<Saved | null>(null)
  const [dirty, setDirty] = useState(false)

  const holderKey = visibleHolders.map((h) => h.id).join(',')
  useEffect(() => {
    store.getSetting<Saved>('fire_plan').then((x) =>
      setS(
        x
          ? { ...x, plan: { ...DEFAULT_PLAN, ...x.plan }, include: { ...DEFAULT_INCLUDE, ...x.include } }
          : { plan: DEFAULT_PLAN, holders: holderKey.split(',').filter(Boolean), include: DEFAULT_INCLUDE, extraSip: 0, extraPassive: 0, autoSip: true, autoPassive: true },
      ),
    )
  }, [store, holderKey])

  const calc = useMemo(() => {
    if (!s) return null
    const hs = new Set(s.holders)
    const inScope = (h: string | null) => (h == null ? hs.has('joint') : hs.has(h))
    const parts: { key: string; label: string; value: number }[] = []
    const funds = d.holdings.filter((h) => inScope(h.pos.holder_id)).reduce((t, h) => t + h.value, 0)
    parts.push({ key: 'funds', label: '📈 Mutual funds & stocks', value: funds })
    for (const t of ASSET_TYPES) {
      if (t.v === 'insurance') continue
      const v = d.assets.filter((x) => x.a.type === t.v && inScope(x.a.holder_id)).reduce((a, x) => a + x.v.value, 0)
      if (v) parts.push({ key: t.v, label: `${t.icon} ${t.label}`, value: v })
    }
    const corpus0 = parts.filter((p) => s.include[p.key]).reduce((a, p) => a + p.value, 0)
    const sipAuto =
      db.sips.filter((x) => x.active && inScope(x.holder_id)).reduce((a, x) => a + x.amount, 0) +
      d.assets.filter((x) => ['epf', 'ppf', 'nps'].includes(x.a.type as AssetType) && inScope(x.a.holder_id) && s.include[x.a.type]).reduce((a, x) => a + Number(x.a.details.monthly ?? 0), 0)
    const passiveAuto = d.assets.filter((x) => x.a.type === 'property' && x.v.income && inScope(x.a.holder_id)).reduce((a, x) => a + x.v.income!.yearly / 12, 0)
    const plan: FirePlan = {
      ...s.plan,
      sipMonthly: (s.autoSip ? sipAuto : 0) + s.extraSip,
      passiveMonthly: (s.autoPassive ? passiveAuto : 0) + s.extraPassive,
    }
    const need = corpusNeeded(plan, plan.retireAge, thisYear)
    const earliest = earliestRetireAge(plan, corpus0, thisYear)
    const sipReq = sipNeeded(plan, corpus0, thisYear)
    const broke = lastsTill(plan, corpus0, thisYear)
    const path = simulate(plan, corpus0, thisYear)
    const atRetire = path.find((y) => y.age === plan.retireAge)?.corpus ?? 0
    const deflate = Math.pow(1 + plan.inflation / 100, plan.retireAge - plan.age)
    return { parts, corpus0, sipAuto, passiveAuto, plan, need, earliest, sipReq, broke, path, atRetire, deflate }
  }, [s, d, db.sips, thisYear])

  if (!s || !calc) return <Page title="FIRE plan">Loading…</Page>
  const up = (p: Partial<Saved>) => (setS({ ...s, ...p }), setDirty(true))
  const upPlan = (p: Partial<FirePlan>) => up({ plan: { ...s.plan, ...p } })
  const { plan } = calc
  const onTrack = calc.earliest != null && calc.earliest <= plan.retireAge
  const chart = calc.path.map((y) => ({ age: y.age, Projected: Math.max(0, Math.round(y.corpus)), 'Needed to retire now': y.phase === 'work' ? Math.round(y.need) : undefined }))
  const save = async () => {
    await store.saveSetting('fire_plan', s)
    setDirty(false)
    toast('FIRE plan saved for the family')
  }
  const addGoal = () => up({ plan: { ...s.plan, goals: [...s.plan.goals, { id: uid(), name: '', amount: 0, year: thisYear + 3 }] } })
  const setGoal = (id: string, p: Partial<Goal>) => up({ plan: { ...s.plan, goals: s.plan.goals.map((g) => (g.id === id ? { ...g, ...p } : g)) } })

  return (
    <Page title="FIRE plan" actions={can('settings') && dirty && <Btn small onClick={save}>Save plan</Btn>}>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-slate-500">Your FIRE number (needed at {plan.retireAge})</div>
            <div className="num text-3xl font-semibold">{inr(calc.need, true)}</div>
            <div className="text-xs text-slate-500">= {inr(calc.need / calc.deflate, true)} in today's money</div>
          </div>
          <Badge tone={onTrack ? 'green' : 'amber'}>{onTrack ? 'On track' : 'Behind'}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Stat label="Counted today" value={inr(calc.corpus0, true)} />
          <Stat label={`Projected at ${plan.retireAge}`} value={inr(calc.atRetire, true)} sub={<span className="text-slate-500">{calc.need ? Math.round((calc.atRetire / calc.need) * 100) : 0}% of target</span>} />
          <Stat
            label="Earliest you can retire"
            value={calc.earliest != null ? `Age ${calc.earliest}` : 'After 75'}
            sub={calc.earliest != null ? <span className="text-slate-500">in {thisYear + calc.earliest - plan.age} ({calc.earliest - plan.age} yrs)</span> : null}
          />
          <Stat
            label={`Monthly investing needed to retire at ${plan.retireAge}`}
            value={inr(calc.sipReq, true)}
            sub={<span className={calc.sipReq > plan.sipMonthly ? 'text-amber-700' : 'text-emerald-700'}>now {inr(plan.sipMonthly, true)} · +{plan.sipStepUp}%/yr</span>}
          />
        </div>
        <div className={`mt-3 rounded-lg p-2.5 text-sm ${calc.broke ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
          {calc.broke
            ? `Retiring at ${plan.retireAge} with the current plan, money runs out around age ${calc.broke}. Invest ${inr(calc.sipReq - plan.sipMonthly, true)} more a month, retire later, or spend less.`
            : `Retiring at ${plan.retireAge}, the money lasts beyond age ${plan.lifeAge}.`}
        </div>
      </Card>

      <Card title="Your money over the years">
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" vertical={false} />
              <XAxis dataKey="age" tick={AXIS} tickLine={false} axisLine={{ stroke: '#d4d4d4' }} label={{ value: 'age', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#666' }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => inr(v, true)} width={60} />
              <Tooltip formatter={(v) => inr(Number(v))} labelFormatter={(a) => `Age ${a} (${thisYear + Number(a) - plan.age})`} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine x={plan.retireAge} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'retire', fontSize: 11, fill: '#64748b', position: 'top' }} />
              <Line type="monotone" dataKey="Projected" stroke={S[0]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
              <Line type="monotone" dataKey="Needed to retire now" stroke={S[1]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Where the blue line crosses the orange line, you can stop working. After retirement the blue line shows money left after yearly spending.</p>
      </Card>

      <Card title="1. About you">
        <div className="grid grid-cols-3 gap-3">
          <Num label="Age now" value={s.plan.age} onChange={(v) => upPlan({ age: v })} />
          <Num label="Retire at" value={s.plan.retireAge} onChange={(v) => upPlan({ retireAge: v })} />
          <Num label="Plan till age" value={s.plan.lifeAge} onChange={(v) => upPlan({ lifeAge: v })} />
        </div>
      </Card>

      <Card title="2. Spending">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Household spending per month today" suffix="₹" value={s.plan.monthlyExpense} onChange={(v) => upPlan({ monthlyExpense: v })} hint="Everything: groceries, bills, school, travel, EMIs that will continue…" />
          <Num label="In retirement, spend" suffix="% of today" value={s.plan.retireExpensePct} onChange={(v) => upPlan({ retireExpensePct: v })} hint="No commute/EMIs → often 70–90%; more travel/health → 100%+" />
          <Num label="Inflation" suffix="%/yr" value={s.plan.inflation} onChange={(v) => upPlan({ inflation: v })} />
        </div>
      </Card>

      <Card title="3. Returns">
        <div className="grid grid-cols-2 gap-3">
          <Num label="Before retirement" suffix="%/yr" value={s.plan.preReturn} onChange={(v) => upPlan({ preReturn: v })} hint="Mostly equity: 10–12% is a fair long-term guess" />
          <Num label="After retirement" suffix="%/yr" value={s.plan.postReturn} onChange={(v) => upPlan({ postReturn: v })} hint="Safer mix (more debt): 7–8%" />
        </div>
      </Card>

      <Card title="4. Investing every month">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-auto" checked={s.autoSip} onChange={(e) => up({ autoSip: e.target.checked })} /> Use running SIPs + EPF/PPF/NPS contributions from the app ({inr(calc.sipAuto)}/month)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Num label="Plus extra per month" suffix="₹" value={s.extraSip} onChange={(v) => up({ extraSip: v })} hint="e.g. home-loan prepayments that will turn into SIPs" />
          <Num label="Increase every year" suffix="%" value={s.plan.sipStepUp} onChange={(v) => upPlan({ sipStepUp: v })} hint="Step-up with salary hikes" />
        </div>
      </Card>

      <Card title="5. Income in retirement">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="w-auto" checked={s.autoPassive} onChange={(e) => up({ autoPassive: e.target.checked })} /> Count rent / lease from properties in the app ({inr(calc.passiveAuto)}/month)
        </label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Num label="Other income per month" suffix="₹ today" value={s.extraPassive} onChange={(v) => up({ extraPassive: v })} hint="Pension, side business, art sales…" />
          <Num label="Grows by" suffix="%/yr" value={s.plan.passiveGrowth} onChange={(v) => upPlan({ passiveGrowth: v })} />
        </div>
      </Card>

      <Card title="6. Big expenses planned" right={<Btn small variant="soft" onClick={addGoal}>+ Add</Btn>}>
        {!s.plan.goals.length && <p className="text-sm text-slate-500">e.g. building a house, a child's education, a car, a wedding. Enter today's cost — the app adds inflation.</p>}
        <div className="space-y-2">
          {s.plan.goals.map((g) => (
            <div key={g.id} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-5">
                <Field label="What">
                  <input value={g.name} onChange={(e) => setGoal(g.id, { name: e.target.value })} placeholder="Dehradun house" />
                </Field>
              </div>
              <div className="col-span-3">
                <Num label="Cost today ₹" value={g.amount} onChange={(v) => setGoal(g.id, { amount: v })} />
              </div>
              <div className="col-span-3">
                <Num label="Year" value={g.year} onChange={(v) => setGoal(g.id, { year: v })} />
              </div>
              <button className="col-span-1 pb-2 text-rose-600" aria-label="Remove" onClick={() => up({ plan: { ...s.plan, goals: s.plan.goals.filter((x) => x.id !== g.id) } })}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="7. What counts towards FIRE">
        <div className="mb-2 text-xs text-slate-600">Whose money</div>
        <div className="flex flex-wrap gap-3 text-sm">
          {[...visibleHolders.map((h) => ({ id: h.id, name: h.name })), { id: 'joint', name: 'Family / joint' }].map((h) => (
            <label key={h.id} className="flex items-center gap-1.5">
              <input type="checkbox" className="w-auto" checked={s.holders.includes(h.id)} onChange={(e) => up({ holders: e.target.checked ? [...s.holders, h.id] : s.holders.filter((x) => x !== h.id) })} />
              {h.name}
            </label>
          ))}
        </div>
        <div className="mb-2 mt-4 text-xs text-slate-600">Which assets (your own home and jewellery you won't sell usually stay out)</div>
        <div className="divide-y divide-slate-100 text-sm">
          {calc.parts.map((p) => (
            <label key={p.key} className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2">
                <input type="checkbox" className="w-auto" checked={!!s.include[p.key]} onChange={(e) => up({ include: { ...s.include, [p.key]: e.target.checked } })} />
                {p.label}
              </span>
              <span className={`num ${p.value < 0 ? 'text-rose-700' : ''}`}>{inr(p.value, true)}</span>
            </label>
          ))}
        </div>
      </Card>
      {can('settings') && dirty && (
        <Btn className="w-full" onClick={save}>
          Save plan for the family
        </Btn>
      )}
      <p className="text-center text-[11px] text-slate-500">
        A planning estimate, not a guarantee — returns and inflation vary. Revisit once a year. Taxes on withdrawals aren't modelled; keep a margin.
      </p>
    </Page>
  )
}
