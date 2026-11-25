import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Badge, Btn, Card, Gain, inr, Page } from '../../app/ui'
import { compressImage } from '../../app/photo'
import { ASSET_TYPES } from '../../core/assets'
import { fmtDate } from '../../core/dates'
import { FIELDS, NOMINEE_FIELD, SHARE_FIELD } from './fields'

function Photo({ path, onDelete }: { path: string; onDelete?: () => void }) {
  const { store } = useApp()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    store.photoUrl(path).then(setUrl).catch(() => setUrl(null))
  }, [path, store])
  return (
    <div className="relative">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" className="h-32 w-full rounded-lg object-cover" />
        </a>
      ) : (
        <div className="h-32 w-full animate-pulse rounded-lg bg-slate-100" />
      )}
      {onDelete && (
        <button onClick={onDelete} className="absolute right-1 top-1 rounded-full bg-black/60 px-2 text-xs text-white" aria-label="Delete photo">
          ✕
        </button>
      )}
    </div>
  )
}

export default function AssetDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { d, db, holderName, can, store, reload, toast } = useApp()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const x = d.assets.find((y) => y.a.id === id)
  const raw = db.assets.find((a) => a.id === id)
  if (!raw) return <Page title="Not found" back>This item no longer exists.</Page>
  const a = raw
  const v = x?.v
  const meta = ASSET_TYPES.find((t) => t.v === a.type)!
  const fields = [...FIELDS[a.type], SHARE_FIELD, NOMINEE_FIELD]
  const photos = a.photos ?? []

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      const paths: string[] = []
      for (const f of Array.from(files)) {
        const blob = await compressImage(f, store.mode === 'demo' ? 900 : 1600, store.mode === 'demo' ? 0.6 : 0.72)
        paths.push(await store.uploadPhoto(blob, f.name || 'photo.jpg'))
      }
      await store.update('assets', a.id, { photos: [...photos, ...paths] })
      toast(`${paths.length} photo${paths.length > 1 ? 's' : ''} added`)
      reload()
    } catch (e) {
      alert('Upload failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  const delPhoto = async (p: string) => {
    if (!confirm('Delete this photo?')) return
    await store.removePhoto(p)
    await store.update('assets', a.id, { photos: photos.filter((x) => x !== p) })
    reload()
  }
  const del = async () => {
    if (!confirm(`Delete "${a.name}"? Its photos are deleted too.`)) return
    for (const p of photos) await store.removePhoto(p).catch(() => {})
    await store.remove('assets', a.id)
    toast('Deleted')
    await reload()
    nav('/wealth', { replace: true })
  }

  return (
    <Page title={a.name} back actions={can('add') && <Link to={`/wealth/${a.id}/edit`}><Btn small variant="ghost">Edit</Btn></Link>}>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone="teal">{a.holder_id ? holderName(a.holder_id) : 'Family / joint'}</Badge>
        <Badge>
          {meta.icon} {meta.label}
        </Badge>
        {v && v.share < 1 && <Badge>{Math.round(v.share * 100)}% share</Badge>}
      </div>
      {v && (
        <Card>
          <div className="text-xs text-slate-500">{a.type === 'loan' ? 'Still owed' : a.type === 'insurance' ? 'Cover' : 'Worth today (estimate)'}</div>
          <div className={`num text-3xl font-semibold ${v.value < 0 ? 'text-rose-700' : ''}`}>{a.type === 'insurance' ? inr(Number(a.details.cover ?? 0)) : inr(Math.abs(v.value))}</div>
          {v.cost ? (
            <div className="text-sm">
              <Gain v={v.value - v.cost} base={v.cost} /> <span className="text-slate-500">vs {inr(v.cost)} paid</span>
            </div>
          ) : null}
          <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
            {v.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {v.future && (
            <div className="mt-2 text-sm">
              {a.type === 'fd' ? 'At maturity' : 'In 10 years'}: <b className="num">{inr(v.future.value)}</b> <span className="text-slate-500">({fmtDate(v.future.date)})</span>
            </div>
          )}
          {v.income && (
            <div className="mt-1 text-sm">
              Income: <b className="num">{inr(v.income.yearly)}</b> {v.income.label}
              {v.income.taxNote && <div className="text-xs text-slate-500">{v.income.taxNote}</div>}
            </div>
          )}
          {v.alerts.map((al) => (
            <div key={al.text} className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
              {al.text}
            </div>
          ))}
          {v.taxNote && <div className="mt-3 text-xs text-slate-600">🧾 {v.taxNote}</div>}
        </Card>
      )}

      <Card
        title={`Photos & documents (${photos.length})`}
        right={
          can('add') && (
            <>
              <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              <Btn small onClick={() => fileRef.current?.click()} disabled={busy}>
                {busy ? 'Uploading…' : '📷 Add photo'}
              </Btn>
            </>
          )
        }
      >
        {photos.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => (
              <Photo key={p} path={p} onDelete={can('add') ? () => delPhoto(p) : undefined} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Take a photo of the item, the bill, registry / khatauni, FD receipt or policy document. Photos are private to the family.</p>
        )}
      </Card>

      <Card title="Details">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          {fields
            .filter((f) => a.details[f.k] != null && a.details[f.k] !== '' && (!f.show || f.show(a.details)))
            .map((f) => (
              <div key={f.k} className="contents">
                <dt className="text-slate-500">{f.label}</dt>
                <dd>{f.kind === 'select' ? (f.options?.find((o) => o.v === String(a.details[f.k]))?.label ?? a.details[f.k]) : f.kind === 'date' ? fmtDate(a.details[f.k]) : f.kind === 'number' && !f.k.includes('year') && Number(a.details[f.k]) >= 1000 ? Number(a.details[f.k]).toLocaleString('en-IN') : String(a.details[f.k])}</dd>
              </div>
            ))}
          {a.details.lat != null && (
            <div className="contents">
              <dt className="text-slate-500">Location</dt>
              <dd>
                <a className="text-teal-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${a.details.lat},${a.details.lng}`}>
                  Open in Google Maps
                </a>
              </dd>
            </div>
          )}
        </dl>
        {a.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{a.notes}</p>}
      </Card>
      {can('delete') && (
        <button className="text-sm text-rose-700" onClick={del}>
          Delete this item
        </button>
      )}
    </Page>
  )
}
