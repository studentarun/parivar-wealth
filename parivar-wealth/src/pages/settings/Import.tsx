import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Badge, Btn, Card, inr, Page } from '../../app/ui'
import { fmtDate } from '../../core/dates'
import type { Holder, Instrument } from '../../core/types'
import type { ImportPlan } from '../../data/importExcel'

const REL: Record<string, string> = { tarun: 'self', anu: 'wife', anushree: 'wife', papa: 'father', maa: 'mother' }

export default function Import() {
  const { db, store, reload, can } = useApp()
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [sipSel, setSipSel] = useState<Record<number, boolean>>({})
  const [withSold, setWithSold] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const already = db.txns.some((t) => t.source === 'import')

  if (!can('settings')) return <Page title="Import" back>Only the admin can import.</Page>

  const onFile = async (f: File) => {
    const { parseWorkbook } = await import('../../data/importExcel')
    const p = parseWorkbook(await f.arrayBuffer())
    setPlan(p)
    setSipSel(Object.fromEntries(p.sips.map((s, i) => [i, s.instKey.startsWith('MF:')])))
  }

  const apply = async () => {
    if (!plan) return
    if (already && !confirm('You imported before. Importing again will create duplicate entries. Continue?')) return
    try {
      setBusy('Family members…')
      const hid = new Map<string, string>()
      for (const h of db.holders) hid.set(h.name.toLowerCase(), h.id)
      const newH = plan.holders.filter((n) => !hid.has(n.toLowerCase()))
      if (newH.length) {
        const order = ['tarun', 'anu', 'papa', 'maa']
        const rows = await store.insert<Holder>(
          'holders',
          newH.map((n) => ({ name: n, relation: REL[n.toLowerCase()] ?? null, other_income: 0, sort: order.indexOf(n.toLowerCase()) >= 0 ? order.indexOf(n.toLowerCase()) : 9 })),
        )
        rows.forEach((r) => hid.set(r.name.toLowerCase(), r.id))
      }
      setBusy('Funds & stocks…')
      const iid = new Map<string, string>()
      for (const i of db.instruments) iid.set(`${i.kind}:${i.code}`, i.id)
      const newI = plan.instruments.filter((i) => !iid.has(`${i.kind}:${i.code}`))
      if (newI.length) (await store.insert<Instrument>('instruments', newI)).forEach((r) => iid.set(`${r.kind}:${r.code}`, r.id))
      setBusy(`Prices…`)
      await store.addPrices?.(plan.prices)
      if (plan.schemes.length && store.seedSchemes) await store.seedSchemes(plan.schemes)
      setBusy(`${plan.txns.length} entries…`)
      const txns = plan.txns
        .filter((t) => withSold || t.note !== 'from sold sheet')
        .map(({ holder, instKey, ...t }) => ({ ...t, holder_id: hid.get(holder.toLowerCase())!, instrument_id: iid.get(instKey)! }))
      await store.insert('txns', txns)
      setBusy('SIPs…')
      const sips = plan.sips
        .filter((_, i) => sipSel[i])
        .map((s) => ({ holder_id: hid.get(s.holder.toLowerCase())!, instrument_id: iid.get(s.instKey)!, amount: s.amount, day: s.day, start_date: s.last, active: true, last_run_date: s.last }))
      if (sips.length) await store.insert('sips', sips)
      await reload()
      setDone(true)
    } catch (e) {
      alert('Import failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  if (done)
    return (
      <Page title="Import done 🎉" back>
        <Card>
          <p className="text-sm">Everything is loaded. Two quick things make the tax tips accurate:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
            <li>
              <Link className="text-teal-700 underline" to="/more/family">
                Family members
              </Link>{' '}
              — enter each person's yearly income, and whether Anu's investments were funded by you (clubbing).
            </li>
            <li>
              <Link className="text-teal-700 underline" to="/more/funds">
                Funds
              </Link>{' '}
              — mark funds you want to exit.
            </li>
          </ol>
          <Link to="/">
            <Btn className="mt-4">Go to Home</Btn>
          </Link>
        </Card>
      </Page>
    )

  return (
    <Page title="Import your Excel tracker" back>
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Choose your <b>Finances</b> workbook (.xlsx). The app reads the Mutual Funds, Stocks, Sold, MF_Map and AMFI_NAV sheets. Fund codes come from MF_Map, so NAVs
          match AMFI exactly.
        </p>
        <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        {already && <p className="mt-2 text-xs text-amber-800">You already imported once — importing again will duplicate entries.</p>}
      </Card>
      {plan && (
        <>
          <Card title="Found">
            <ul className="space-y-1 text-sm">
              <li>
                People: <b>{plan.holders.join(', ')}</b>
              </li>
              <li>
                {plan.instruments.length} funds/stocks · {plan.txns.filter((t) => t.note !== 'from sold sheet').length} current entries · {plan.txns.filter((t) => t.note === 'from sold sheet').length / 2} sold trades
              </li>
              <li>
                {plan.schemes.length.toLocaleString('en-IN')} AMFI schemes for search · prices as of {fmtDate(plan.asOf)}
              </li>
            </ul>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" className="w-auto" checked={withSold} onChange={(e) => setWithSold(e.target.checked)} /> Include sold history (for past years' profit)
            </label>
            {plan.warnings.length > 0 && (
              <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
                {plan.warnings.slice(0, 8).map((w) => (
                  <div key={w}>⚠ {w}</div>
                ))}
              </div>
            )}
          </Card>
          <Card title="Running SIPs we spotted (tick the real ones)">
            <p className="mb-2 text-xs text-slate-500">
              From now on the app adds each instalment automatically. If an instalment after the last one in your sheet already happened (e.g. November), it will be
              added with that day's NAV.
            </p>
            <div className="space-y-1.5">
              {plan.sips.map((s, i) => (
                <label key={i} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1 w-auto" checked={!!sipSel[i]} onChange={(e) => setSipSel({ ...sipSel, [i]: e.target.checked })} />
                  <span>
                    <b>{s.holder}</b> · {s.name} · {inr(s.amount)} on day {s.day} <span className="text-xs text-slate-500">(last {fmtDate(s.last)})</span>
                    {!s.instKey.startsWith('MF:') && <Badge tone="amber">stock/ETF — tick only if it's a real SIP</Badge>}
                  </span>
                </label>
              ))}
            </div>
          </Card>
          <Btn className="w-full" disabled={!!busy} onClick={apply}>
            {busy ? `Importing ${busy}` : 'Import everything'}
          </Btn>
        </>
      )}
    </Page>
  )
}
