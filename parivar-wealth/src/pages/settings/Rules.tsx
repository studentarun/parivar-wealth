import { useState } from 'react'
import { useApp } from '../../app/state'
import { Btn, Card, Field, Page } from '../../app/ui'
import { DEFAULT_RULES } from '../../core/rules'
import type { TaxRules } from '../../core/types'

const FIELDS: [keyof TaxRules, string][] = [
  ['ltcg_exemption', 'Tax-free long-term equity profit per person per year (₹)'],
  ['equity_lt_rate', 'Equity long-term rate (%)'],
  ['equity_st_rate', 'Equity short-term rate (%)'],
  ['equity_lt_months', 'Equity becomes long-term after (months)'],
  ['nonequity_lt_rate', 'Non-equity long-term rate (%)'],
  ['nonequity_listed_lt_months', 'Listed non-equity ETF long-term after (months)'],
  ['nonequity_unlisted_lt_months', 'International / other FoF long-term after (months)'],
  ['elss_lock_months', 'ELSS lock-in (months)'],
  ['basic_exemption', 'Basic exemption — new regime (₹)'],
  ['rebate_income_limit', 'Rebate: income limit (₹)'],
  ['rebate_max', 'Rebate: max amount (₹)'],
  ['cess', 'Health & education cess (%)'],
  ['stamp_duty', 'Stamp duty on MF purchase (%)'],
  ['harvest_buffer', 'Safety gap kept below the tax-free limit (₹)'],
  ['near_lt_warn_days', 'Warn if units turn long-term within (days)'],
]

export default function Rules() {
  const { db, can, store, reload, toast } = useApp()
  const [r, setR] = useState<TaxRules>(db.rules)
  const [slabs, setSlabs] = useState(JSON.stringify(db.rules.slabs))
  const edit = can('settings')
  const save = async () => {
    try {
      const next = { ...r, slabs: JSON.parse(slabs), last_reviewed: new Date().toISOString().slice(0, 10) }
      await store.saveSetting('tax_rules', next)
      toast('Tax rules saved')
      reload()
    } catch (e) {
      alert('Check the slab list format: ' + String(e))
    }
  }
  return (
    <Page title="Tax rules" back>
      <Card>
        <p className="text-sm text-slate-600">
          The app's tax tips are calculated from these numbers. After each Budget (1 Feb), check them against the Income Tax department / a CA and update here — every
          family member's app updates instantly.
        </p>
      </Card>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Version label">
            <input disabled={!edit} value={r.version} onChange={(e) => setR({ ...r, version: e.target.value })} />
          </Field>
          {FIELDS.map(([k, label]) => (
            <Field key={k} label={label}>
              <input disabled={!edit} inputMode="decimal" value={String(r[k])} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} />
            </Field>
          ))}
          <Field label="Specified-fund window (intl FoF bought in this period → always slab rate)">
            <div className="flex gap-2">
              <input disabled={!edit} type="date" value={r.specified_window_from} onChange={(e) => setR({ ...r, specified_window_from: e.target.value })} />
              <input disabled={!edit} type="date" value={r.specified_window_to} onChange={(e) => setR({ ...r, specified_window_to: e.target.value })} />
            </div>
          </Field>
        </div>
        <Field label="Slabs (new regime) — [{upto, rate}], last one upto null">
          <textarea disabled={!edit} rows={3} className="font-mono text-xs" value={slabs} onChange={(e) => setSlabs(e.target.value)} />
        </Field>
        {edit && (
          <div className="mt-3 flex gap-2">
            <Btn onClick={save}>Save rules</Btn>
            <Btn variant="ghost" onClick={() => (setR(DEFAULT_RULES), setSlabs(JSON.stringify(DEFAULT_RULES.slabs)))}>
              Reset to app defaults
            </Btn>
          </div>
        )}
      </Card>
    </Page>
  )
}
