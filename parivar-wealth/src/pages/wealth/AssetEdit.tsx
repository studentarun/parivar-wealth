import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Btn, Card, Field, inr, Page } from '../../app/ui'
import { parseMapLink } from '../../app/photo'
import { ASSET_TYPES, valueAsset, type Asset, type AssetType } from '../../core/assets'
import { FIELDS, NOMINEE_FIELD, SHARE_FIELD, type FieldDef } from './fields'

export default function AssetEdit() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const { db, d, visibleHolders, store, reload, toast, can } = useApp()
  const existing = db.assets.find((a) => a.id === id)
  const [type, setType] = useState<AssetType | null>(existing?.type ?? (sp.get('type') as AssetType | null))
  const [name, setName] = useState(existing?.name ?? '')
  const [holder, setHolder] = useState<string>(existing?.holder_id ?? visibleHolders[0]?.id ?? '')
  const [details, setDetails] = useState<Record<string, any>>(existing?.details ?? {})
  const [override, setOverride] = useState(existing?.value_override != null ? String(existing.value_override) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [maps, setMaps] = useState('')
  const [busy, setBusy] = useState(false)

  const fields: FieldDef[] = useMemo(() => {
    if (!type) return []
    const f = [...FIELDS[type]]
    if (type === 'property') f.push(SHARE_FIELD)
    if (!['insurance'].includes(type)) f.push(NOMINEE_FIELD)
    return f
  }, [type])

  // apply defaults once when the type is chosen
  const withDefaults = useMemo(() => {
    const x = { ...details }
    for (const f of fields) if (x[f.k] == null && f.def != null) x[f.k] = f.def
    return x
  }, [details, fields])

  if (!can('add')) return <Page title="Add" back>You don't have permission to add.</Page>

  if (!type)
    return (
      <Page title="What do you want to add?" back>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ASSET_TYPES.map((t) => (
            <button key={t.v} onClick={() => setType(t.v)} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-teal-400">
              <div className="text-2xl">{t.icon}</div>
              <div className="mt-1 text-sm font-medium">{t.label}</div>
              <div className="text-xs text-slate-500">{t.hint}</div>
            </button>
          ))}
        </div>
      </Page>
    )

  const meta = ASSET_TYPES.find((t) => t.v === type)!
  const draft: Asset = { id: 'draft', holder_id: holder || null, type, name, details: withDefaults, value_override: override === '' ? null : Number(override), active: true }
  const v = valueAsset(draft, d.today, db.metal)
  const set = (k: string, val: string, kind: FieldDef['kind']) => setDetails({ ...withDefaults, [k]: kind === 'number' ? (val === '' ? null : Number(val.replace(/[^\d.]/g, ''))) : val })

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setDetails({ ...withDefaults, lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }),
      () => alert('Could not get location — allow location access, or paste a Google Maps link instead.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )

  const save = async () => {
    setBusy(true)
    try {
      const row = { holder_id: holder || null, type, name: name.trim() || meta.label, details: withDefaults, value_override: override === '' ? null : Number(override), notes: notes || null, active: true, updated_at: new Date().toISOString() }
      let newId = existing?.id
      if (existing) await store.update('assets', existing.id, row)
      else newId = (await store.insert<Asset>('assets', [{ ...row, photos: [] }]))[0].id
      toast('Saved')
      await reload()
      nav(`/wealth/${newId}`, { replace: true })
    } catch (e) {
      alert('Could not save: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page title={`${existing ? 'Edit' : 'Add'} ${meta.label.toLowerCase()}`} back>
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name (to recognise it)">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'property' ? 'e.g. Mathura house' : type === 'gold' ? 'e.g. Wedding necklace' : type === 'fd' ? 'e.g. SBI FD 2025' : meta.label} />
          </Field>
          <Field label="Whose is it?">
            <select value={holder} onChange={(e) => setHolder(e.target.value)}>
              {visibleHolders.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
              <option value="">Family / joint</option>
            </select>
          </Field>
          {fields
            .filter((f) => !f.show || f.show(withDefaults))
            .map((f) => (
              <Field key={f.k} label={f.label} hint={f.hint}>
                {f.kind === 'select' ? (
                  <select value={String(withDefaults[f.k] ?? '')} onChange={(e) => set(f.k, e.target.value, f.kind)}>
                    {f.options!.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.kind === 'date' ? 'date' : 'text'}
                    inputMode={f.kind === 'number' ? 'decimal' : undefined}
                    value={withDefaults[f.k] == null ? '' : String(withDefaults[f.k])}
                    onChange={(e) => set(f.k, e.target.value, f.kind)}
                  />
                )}
              </Field>
            ))}
        </div>

        {type === 'property' && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-600">Location on map</div>
            <div className="flex flex-wrap items-center gap-2">
              <Btn small variant="soft" onClick={useMyLocation}>
                📍 I'm here — use my location
              </Btn>
              <span className="text-xs text-slate-500">or paste a Google Maps link:</span>
            </div>
            <div className="mt-2 flex gap-2">
              <input value={maps} onChange={(e) => setMaps(e.target.value)} placeholder="https://maps.google.com/…  or  27.59, 78.05" />
              <Btn
                small
                variant="ghost"
                onClick={() => {
                  const p = parseMapLink(maps)
                  if (p) setDetails({ ...withDefaults, ...p })
                  else alert('Could not read coordinates — open the place in Google Maps, long-press the pin, and copy the numbers shown.')
                }}
              >
                Use
              </Btn>
            </div>
            {withDefaults.lat != null && (
              <div className="mt-2 text-xs text-slate-600">
                Saved: {withDefaults.lat}, {withDefaults.lng} ·{' '}
                <a className="text-teal-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${withDefaults.lat},${withDefaults.lng}`}>
                  open map
                </a>
              </div>
            )}
          </div>
        )}

        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-600">More: notes, manual value</summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <Field label="I know the value — use this instead (₹)" hint={type === 'loan' ? 'Enter as a positive number' : 'Leave empty to let the app calculate'}>
              <input inputMode="decimal" value={override} onChange={(e) => setOverride(e.target.value.replace(/[^\d.]/g, ''))} />
            </Field>
            <Field label="Notes">
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Locker no., documents kept where, khasra no.…" />
            </Field>
          </div>
        </details>
      </Card>

      <Card title="Worth today (estimate)">
        <div className={`num text-2xl font-semibold ${v.value < 0 ? 'text-rose-700' : ''}`}>{inr(type === 'loan' && override ? -Number(override) : v.value)}</div>
        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
          {v.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {v.future && <div className="mt-2 text-sm">{type === 'fd' ? 'At maturity' : 'In 10 years'}: <b className="num">{inr(v.future.value)}</b> ({v.future.date})</div>}
        {v.income && (
          <div className="mt-1 text-sm">
            Income: <b className="num">{inr(v.income.yearly)}</b> {v.income.label}
          </div>
        )}
        {v.alerts.map((al) => (
          <div key={al.text} className="mt-2 text-xs text-amber-800">
            ⚠ {al.text}
          </div>
        ))}
        <Btn className="mt-4 w-full" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Save — then add photos'}
        </Btn>
      </Card>
    </Page>
  )
}
