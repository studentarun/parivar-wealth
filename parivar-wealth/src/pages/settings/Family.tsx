import { useState } from 'react'
import { useApp } from '../../app/state'
import { Btn, Card, Field, inr, Page } from '../../app/ui'
import type { Holder } from '../../core/types'

export default function Family() {
  const { db, can, store, reload, toast } = useApp()
  const edit = can('settings')
  const [adding, setAdding] = useState('')
  return (
    <Page title="Family members" back>
      <p className="text-sm text-slate-600">
        Each person's <b>other yearly income</b> (pension, salary after standard deduction, rent, FD interest) decides their tax slab — the app uses it to pick the
        cheapest account for each type of investment.
      </p>
      {db.holders.map((h) => (
        <HolderCard key={h.id} h={h} all={db.holders} edit={edit} onSave={async (p) => (await store.update('holders', h.id, p), toast('Saved'), reload())} />
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
    </Page>
  )
}

function HolderCard({ h, all, edit, onSave }: { h: Holder; all: Holder[]; edit: boolean; onSave: (p: Partial<Holder>) => void }) {
  const [name, setName] = useState(h.name)
  const [rel, setRel] = useState(h.relation ?? '')
  const [inc, setInc] = useState(String(h.other_income ?? 0))
  const [club, setClub] = useState(h.clubbed_with ?? '')
  const dirty = name !== h.name || rel !== (h.relation ?? '') || Number(inc) !== h.other_income || club !== (h.clubbed_with ?? '')
  return (
    <Card title={h.name}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input disabled={!edit} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Relation">
          <input disabled={!edit} placeholder="self / wife / father / mother" value={rel} onChange={(e) => setRel(e.target.value)} />
        </Field>
        <Field label="Other taxable income per year (₹)" hint={`= ${inr(Number(inc), true)} per year`}>
          <input disabled={!edit} inputMode="numeric" value={inc} onChange={(e) => setInc(e.target.value.replace(/[^\d]/g, ''))} />
        </Field>
        <Field label="Investments funded by spouse? (clubbing)" hint="If yes, profit is taxed in the spouse's return and shares their ₹1.25L limit.">
          <select disabled={!edit} value={club} onChange={(e) => setClub(e.target.value)}>
            <option value="">No — own money</option>
            {all
              .filter((x) => x.id !== h.id && !x.clubbed_with)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  Yes — funded by {x.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {edit && dirty && (
        <Btn className="mt-3" small onClick={() => onSave({ name, relation: rel || null, other_income: Number(inc) || 0, clubbed_with: club || null })}>
          Save
        </Btn>
      )}
    </Card>
  )
}
