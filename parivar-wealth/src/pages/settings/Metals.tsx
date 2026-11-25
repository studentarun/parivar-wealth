import { useState } from 'react'
import { useApp } from '../../app/state'
import { Btn, Card, Field, inr, Page } from '../../app/ui'
import { fmtDate } from '../../core/dates'
import type { MetalRates } from '../../core/assets'

export default function Metals() {
  const { db, can, store, reload, toast, d } = useApp()
  const m = db.metal
  const [gold, setGold] = useState(m ? String(m.gold24) : '')
  const [silver, setSilver] = useState(m ? String(m.silver) : '')
  const save = async () => {
    const v: MetalRates = { date: d.today, source: 'manual', gold24: Number(gold), silver: Number(silver) }
    await store.saveSetting('metal_rates', v)
    toast('Rates saved')
    reload()
  }
  return (
    <Page title="Gold & silver rates" back>
      <Card>
        {m ? (
          <div className="text-sm">
            <div>
              Gold 24K (999): <b className="num">{inr(m.gold24)}/g</b> · 22K ≈ <b className="num">{inr(m.gold24 * (0.916 / 0.999))}/g</b>
            </div>
            <div>
              Silver 999: <b className="num">{inr(m.silver)}/g</b> ({inr(m.silver * 1000)}/kg)
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {m.source === 'IBJA' ? 'From IBJA (India Bullion & Jewellers Association), updated nightly' : 'Entered manually'} · {fmtDate(m.date)}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No rate yet. The nightly update fetches IBJA rates; you can also enter them below.</p>
        )}
      </Card>
      {can('settings') && (
        <Card title="Enter rates manually">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Gold 24K (₹ per gram)">
              <input inputMode="decimal" value={gold} onChange={(e) => setGold(e.target.value)} />
            </Field>
            <Field label="Silver 999 (₹ per gram)">
              <input inputMode="decimal" value={silver} onChange={(e) => setSilver(e.target.value)} />
            </Field>
          </div>
          <Btn className="mt-3" disabled={!Number(gold)} onClick={save}>
            Save
          </Btn>
          <p className="mt-2 text-xs text-slate-500">The next nightly IBJA update will replace a manual rate.</p>
        </Card>
      )}
    </Page>
  )
}
