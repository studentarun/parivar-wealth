import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Chips, Field, Gain, inr, Page, units as fu } from '../app/ui'
import { daysBetween, fmtDate } from '../core/dates'
import { ltDate, simulateSell, unitsOf, unlockDate } from '../core/lots'
import { roundUnits } from '../core/sip'
import { extraTax, gainsOf, taxPersonId } from '../core/tax'
import { priceKey } from '../core/types'

export default function Withdraw() {
  const { holder, inst } = useParams()
  const { d, db, can, store, reload, toast, holderName } = useApp()
  const nav = useNavigate()
  const h = d.holdings.find((x) => x.pos.holder_id === holder && x.pos.instrument.id === inst)
  const [by, setBy] = useState<'amount' | 'units' | 'all'>('amount')
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const r = db.rules
  const today = d.today

  const calc = useMemo(() => {
    if (!h || h.price == null) return null
    const i = h.pos.instrument
    // ELSS: only unlocked units (oldest first) can be sold
    let sellable = 0
    for (const l of h.pos.lots) {
      const u = unlockDate(l.date, i.tax_class, r)
      if (u && today < u) break
      sellable += l.units
    }
    const want = by === 'all' ? sellable : by === 'units' ? Number(val) || 0 : roundUnits((Number(val) || 0) / h.price, i.kind)
    const u = Math.min(want, sellable)
    const pieces = simulateSell(h.pos, u, h.price, today, r)
    const g = gainsOf(pieces)
    const pid = taxPersonId(db.holders, h.pos.holder_id)
    const py = d.years.find((y) => y.person.id === pid)
    const tax = py ? extraTax(py, g, r) : 0
    const load = pieces.reduce((s, p) => s + p.exit_load, 0)
    const proceeds = pieces.reduce((s, p) => s + p.proceeds, 0)
    // would waiting help? find next date when any short-term piece with profit turns long-term
    let wait: { date: string; save: number } | null = null
    const stProfit = pieces.filter((p) => p.term === 'ST' && p.gain > 0)
    if (stProfit.length && py) {
      const dates = stProfit.map((p) => ltDate(p.buy_date, i.tax_class, r)).filter(Boolean) as string[]
      const last = dates.sort().pop()
      if (last && daysBetween(today, last) <= 120) {
        const later = simulateSell(h.pos, u, h.price, last, r)
        const t2 = extraTax(py, gainsOf(later), r)
        if (tax - t2 > 200) wait = { date: last, save: tax - t2 }
      }
    }
    return { u, sellable, pieces, tax, load, proceeds, py, wait, gain: pieces.reduce((s, p) => s + p.gain, 0) }
  }, [h, by, val, db.holders, d.years, r, today])

  if (!h) return <Page title="Withdraw" back>Holding not found.</Page>
  if (!can('withdraw')) return <Page title="Withdraw" back>You don't have permission to withdraw. Ask the admin.</Page>
  const i = h.pos.instrument

  const submit = async () => {
    if (!calc || calc.u <= 0) return
    setBusy(true)
    try {
      const pts = await store.pricesFrom(priceKey(i), today)
      const p = pts.find((x) => x.date === today)
      if (i.kind !== 'MF' || p || store.mode === 'demo') {
        const price = p?.price ?? h.price!
        await store.insert('txns', [{ holder_id: h.pos.holder_id, instrument_id: i.id, date: today, type: 'SELL', units: calc.u, price, amount: calc.u * price, status: 'done', source: 'manual' }])
        toast(`Sold ${fu(calc.u)} units`)
      } else {
        await store.insert('txns', [{ holder_id: h.pos.holder_id, instrument_id: i.id, date: today, type: 'SELL', units: calc.u, price: null, amount: null, status: 'pending', source: 'manual' }])
        toast("Withdrawal saved — today's NAV will be applied tonight")
      }
      await reload()
      nav(`/h/${h.pos.holder_id}/${i.id}`)
    } catch (e) {
      alert('Could not save: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title="Withdraw" back>
      <Card>
        <div className="text-sm font-medium">{i.name}</div>
        <div className="text-xs text-slate-500">
          {holderName(h.pos.holder_id)} · {fu(unitsOf(h.pos))} units · value {inr(h.value)} @ {h.price} ({fmtDate(h.priceDate)})
        </div>
        <div className="mt-4 space-y-3">
          <Chips
            value={by}
            onChange={setBy}
            options={[
              { v: 'amount', label: 'By amount' },
              { v: 'units', label: 'By units' },
              { v: 'all', label: 'Withdraw all' },
            ]}
          />
          {by !== 'all' && (
            <Field label={by === 'amount' ? 'Amount (₹)' : 'Units'}>
              <input inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} />
            </Field>
          )}
          {calc && calc.sellable < unitsOf(h.pos) - 1e-6 && (
            <p className="text-xs text-amber-800">Only {fu(calc.sellable)} units can be sold today — the rest are in ELSS lock-in.</p>
          )}
        </div>
      </Card>

      {calc && calc.u > 0 && (
        <Card title="Before you confirm">
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-slate-600">Units sold (oldest first)</span>
            <span className="num text-right">{fu(calc.u)}</span>
            <span className="text-slate-600">You receive (approx.)</span>
            <span className="num text-right">{inr(calc.proceeds)}</span>
            <span className="text-slate-600">Profit in this sale</span>
            <span className="text-right">
              <Gain v={calc.gain} />
            </span>
            {calc.load > 0 && (
              <>
                <span className="text-slate-600">Exit load (units under {i.exit_load_days} days)</span>
                <span className="num text-right text-rose-700">{inr(calc.load)}</span>
              </>
            )}
            <span className="text-slate-600">Extra tax for {calc.py?.person.name}</span>
            <span className={`num text-right font-semibold ${calc.tax > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{calc.tax > 0.5 ? inr(calc.tax) : '₹0 — tax-free'}</span>
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-600">
            {calc.pieces.slice(0, 6).map((p, k) => (
              <div key={k} className="flex justify-between">
                <span>
                  {fmtDate(p.buy_date)} · {fu(p.units)} units{' '}
                  <Badge tone={p.term === 'LT' ? 'green' : 'amber'}>{p.slab ? 'slab rate' : p.term === 'LT' ? 'long-term' : 'short-term'}</Badge>
                </span>
                <Gain v={p.gain} />
              </div>
            ))}
            {calc.pieces.length > 6 && <div className="text-slate-500">…and {calc.pieces.length - 6} more purchase lots</div>}
          </div>
          {calc.py && (
            <p className="mt-3 text-xs text-slate-600">
              Tax-free limit left this year for {calc.py.person.name} after this sale:{' '}
              <b>{inr(Math.max(0, calc.py.exemptionLeft - Math.max(0, gainsOf(calc.pieces).eqLT)))}</b> of {inr(r.ltcg_exemption)}.
            </p>
          )}
          {calc.wait && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              ⏳ Wait until <b>{fmtDate(calc.wait.date)}</b> and this sale saves about <b>{inr(calc.wait.save)}</b> in tax (units become long-term).
            </div>
          )}
          <Btn className="mt-4 w-full" disabled={busy} onClick={submit}>
            {busy ? 'Saving…' : `Confirm withdrawal of ${inr(calc.proceeds)}`}
          </Btn>
          <p className="mt-2 text-center text-[11px] text-slate-500">Estimate uses the last known price; for funds, the actual NAV of the day is applied.</p>
        </Card>
      )}
    </Page>
  )
}
