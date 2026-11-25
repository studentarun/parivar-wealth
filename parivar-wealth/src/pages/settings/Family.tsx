import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Badge, Btn, Card, Field, inr, Page } from '../../app/ui'
import { taxableIncome } from '../../core/income'
import type { AgeGroup, Holder, IncomeSources } from '../../core/types'

export default function Family() {
  const { db, can, store, reload, toast } = useApp()
  const edit = can('settings')
  const rules = db.rules
  const [adding, setAdding] = useState('')
  const counts = (id: string) => ({
    entries: db.txns.filter((t) => t.holder_id === id).length,
    sips: db.sips.filter((s) => s.holder_id === id).length,
  })
  const dupNames = new Set(
    db.holders.map((h) => h.name.trim().toLowerCase()).filter((n, i, a) => a.indexOf(n) !== i),
  )

  const merge = async (from: Holder, to: Holder) => {
    const c = counts(from.id)
    if (!confirm(`Move ${c.entries} entries and ${c.sips} SIPs from "${from.name}" to "${to.name}", then remove "${from.name}"?`)) return
    await store.reassignHolder(from.id, to.id)
    await store.remove('holders', from.id)
    toast(`Merged ${from.name} into ${to.name}`)
    reload()
  }
  const del = async (h: Holder) => {
    const c = counts(h.id)
    const msg = c.entries || c.sips
      ? `"${h.name}" has ${c.entries} entries and ${c.sips} SIPs. Deleting removes them permanently. If this is a duplicate, use "Merge into" instead.\n\nDelete anyway?`
      : `Delete "${h.name}"?`
    if (!confirm(msg)) return
    await store.remove('holders', h.id)
    toast(`${h.name} removed`)
    reload()
  }

  return (
    <Page title="Family members" back>
      <p className="text-sm text-slate-600">
        Enter each person's <b>total yearly income</b> (pension, rent, interest…) and tax regime — the app works out their taxable income and slab itself. Their{' '}
        <b>login email</b> lets them open the shared family app.
      </p>
      {dupNames.size > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Some names appear twice. Use <b>Merge into</b> on the empty copy (0 entries) — or on either one — to combine them.
        </div>
      )}
      {db.holders.map((h) => (
        <HolderCard
          key={h.id}
          h={h}
          rules={rules}
          all={db.holders}
          edit={edit}
          counts={counts(h.id)}
          dup={dupNames.has(h.name.trim().toLowerCase())}
          onSave={async (p) => {
            try {
              await store.update('holders', h.id, p)
              toast('Saved')
              reload()
            } catch (e) {
              alert('Could not save: ' + (e instanceof Error ? e.message : String(e)))
            }
          }}
          onMerge={(to) => merge(h, to)}
          onDelete={() => del(h)}
        />
      ))}
      {edit && (
        <Card title="Add a family member">
          <div className="flex gap-2">
            <input placeholder="Name" value={adding} onChange={(e) => setAdding(e.target.value)} />
            <Btn
              disabled={!adding.trim()}
              onClick={async () => {
                await store.insert('holders', [{ name: adding.trim(), other_income: 0, sort: db.holders.length }])
                setAdding('')
                reload()
              }}
            >
              Add
            </Btn>
          </div>
        </Card>
      )}
      <p className="text-xs text-slate-500">
        After saving an email here, share the app link with that person — see <Link className="text-teal-700 underline" to="/more/users">Family logins</Link>.
      </p>
    </Page>
  )
}

function HolderCard({
  h,
  rules,
  all,
  edit,
  counts,
  dup,
  onSave,
  onMerge,
  onDelete,
}: {
  h: Holder
  rules: import('../../core/types').TaxRules
  all: Holder[]
  edit: boolean
  counts: { entries: number; sips: number }
  dup: boolean
  onSave: (p: Partial<Holder>) => void
  onMerge: (to: Holder) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(h.name)
  const [rel, setRel] = useState(h.relation ?? '')
  const [regime, setRegime] = useState<'new' | 'old'>(h.regime ?? 'new')
  const [age, setAge] = useState<AgeGroup>(h.age_group ?? 'below60')
  const [src, setSrc] = useState<IncomeSources>(h.income ?? {})
  const [override, setOverride] = useState(!!h.income_override)
  const [inc, setInc] = useState(String(h.other_income ?? 0))
  const calc = taxableIncome(src, { regime, age_group: age }, rules)
  const taxable = override ? Number(inc) || 0 : calc.taxable
  const [club, setClub] = useState(h.clubbed_with ?? '')
  const [email, setEmail] = useState(h.email ?? '')
  const [mergeTo, setMergeTo] = useState('')
  const dirty =
    name !== h.name ||
    rel !== (h.relation ?? '') ||
    taxable !== h.other_income ||
    club !== (h.clubbed_with ?? '') ||
    email.trim() !== (h.email ?? '') ||
    regime !== (h.regime ?? 'new') ||
    age !== (h.age_group ?? 'below60') ||
    override !== !!h.income_override ||
    JSON.stringify(src) !== JSON.stringify(h.income ?? {})
  const setS = (k: keyof IncomeSources, v: string) => setSrc({ ...src, [k]: Number(v.replace(/[^\d]/g, '')) || 0 })
  const others = all.filter((x) => x.id !== h.id)
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          {h.name} {dup && <Badge tone="amber">duplicate name</Badge>}
        </span>
      }
      right={
        <span className="text-xs text-slate-500">
          {counts.entries} entries · {counts.sips} SIPs
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input disabled={!edit} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Relation">
          <input disabled={!edit} placeholder="self / wife / father / mother" value={rel} onChange={(e) => setRel(e.target.value)} />
        </Field>
        <Field label="Login email (to open the family app)" hint="They sign up with this email and get in straight away.">
          <input disabled={!edit} type="email" placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Tax regime">
          <select disabled={!edit} value={regime} onChange={(e) => setRegime(e.target.value as 'new' | 'old')}>
            <option value="new">New regime (default)</option>
            <option value="old">Old regime</option>
          </select>
        </Field>
        <Field label="Age">
          <select disabled={!edit} value={age} onChange={(e) => setAge(e.target.value as AgeGroup)}>
            <option value="below60">Below 60</option>
            <option value="60to79">60 – 79 (senior citizen)</option>
            <option value="80plus">80+ (super senior)</option>
          </select>
        </Field>
        <Field label="Investments funded by spouse? (clubbing)" hint="If yes, profit is taxed in the spouse's return and shares their ₹1.25L limit.">
          <select disabled={!edit} value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">No — own money</option>
            {others
              .filter((x) => !x.clubbed_with)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  Yes — funded by {x.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-600">Total income per year (before tax) — excluding profit from investments</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(
            [
              ['salary', 'Salary'],
              ['pension', 'Pension'],
              ['rent', 'Rent received'],
              ['interest', 'FD / savings interest'],
              ['other', 'Other income'],
              ...(regime === 'old' ? ([['deductions', '80C / 80D / other deductions']] as const) : []),
            ] as const
          ).map(([k, label]) => (
            <Field key={k} label={label}>
              <input disabled={!edit} inputMode="numeric" value={src[k] ? String(src[k]) : ''} placeholder="0" onChange={(e) => setS(k, e.target.value)} />
            </Field>
          ))}
        </div>
        <div className="mt-3 text-sm">
          {calc.lines.length > 0 && <div className="mb-1 space-y-0.5 text-xs text-slate-500">{calc.lines.map((l) => <div key={l}>{l}</div>)}</div>}
          <div>
            Taxable income: <b className="num">{inr(calc.taxable)}</b> → income tax <b className="num">{calc.tax ? inr(calc.tax) : '₹0'}</b>
            {calc.tax === 0 && calc.taxable > 0 && <span className="text-xs text-emerald-700"> (below the tax-free limit / rebate)</span>}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input disabled={!edit} type="checkbox" className="w-auto" checked={override} onChange={(e) => (setOverride(e.target.checked), setInc(String(calc.taxable)))} /> Use my own taxable income
            figure instead
          </label>
          {override && (
            <div className="mt-1 w-48">
              <input disabled={!edit} inputMode="numeric" value={inc} onChange={(e) => setInc(e.target.value.replace(/[^\d]/g, ''))} />
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate-500">Estimate only — family pension, HRA and other special cases aren't covered. Use the override if your ITR shows a different figure.</p>
        </div>
      </div>
      {edit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          {dirty && (
            <Btn small onClick={() => onSave({
                  name: name.trim(),
                  relation: rel || null,
                  other_income: taxable,
                  clubbed_with: club || null,
                  email: email.trim().toLowerCase() || null,
                  regime,
                  age_group: age,
                  income: src,
                  income_override: override,
                })}>
              Save changes
            </Btn>
          )}
          <select className="w-auto text-sm" value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}>
            <option value="">Merge into…</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <Btn small variant="ghost" disabled={!mergeTo} onClick={() => onMerge(all.find((x) => x.id === mergeTo)!)}>
            Merge
          </Btn>
          <Btn small variant="ghost" className="ml-auto text-rose-700" onClick={onDelete}>
            Delete
          </Btn>
        </div>
      )}
    </Card>
  )
}
