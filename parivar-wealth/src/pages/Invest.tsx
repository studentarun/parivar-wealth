import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Chips, Field, Page } from '../app/ui'
import { defaultExitLoad, guessCategory, guessKind, guessTaxClass } from '../core/classify'
import { addDays, addMonths, fmtDate, monthDate, nowISTHour } from '../core/dates'
import { unitsFor } from '../core/sip'
import { priceKey, type Instrument, type Kind } from '../core/types'

type Pick = { existing?: Instrument; kind: Kind; code: string; name: string; hint?: string; px?: { date: string; price: number } }

export default function Invest() {
  const { db, d, visibleHolders, can, store, reload, toast, holderName } = useApp()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const [holder, setHolder] = useState(sp.get('holder') || visibleHolders[0]?.id || '')
  const [mode, setMode] = useState<'once' | 'sip'>(sp.get('mode') === 'sip' ? 'sip' : 'once')
  const pre = db.instruments.find((i) => i.id === sp.get('inst'))
  const [pick, setPick] = useState<Pick | null>(pre ? { existing: pre, kind: pre.kind, code: pre.code, name: pre.name } : null)
  const [tab, setTab] = useState<'mf' | 'stock'>(pre && pre.kind !== 'MF' ? 'stock' : 'mf')
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [results, setResults] = useState<Pick[]>([])
  const [amount, setAmount] = useState(sp.get('amount') ?? '')
  const [qty, setQty] = useState('')
  const [px, setPx] = useState('')
  const [date, setDate] = useState(d.today)
  const [after, setAfter] = useState(nowISTHour() >= 15)
  const [day, setDay] = useState(String(Math.min(28, Number(d.today.slice(8)))))
  const [charges, setCharges] = useState('')
  const [busy, setBusy] = useState(false)

  const inst = pick?.existing
  const isMF = (pick?.kind ?? (tab === 'mf' ? 'MF' : 'STOCK')) === 'MF'
  const key = pick ? priceKey({ kind: pick.kind, code: pick.code }) : ''
  const latest = (key ? d.book.latest(key) : null) ?? pick?.px ?? null

  // search
  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim()
      if (term.length < 2) return setResults([])
      const lc = term.toLowerCase()
      const fam: Pick[] = db.instruments
        .filter((i) => (tab === 'mf' ? i.kind === 'MF' : i.kind !== 'MF') && (i.name.toLowerCase().includes(lc) || i.code.toLowerCase().includes(lc)))
        .map((i) => ({ existing: i, kind: i.kind, code: i.code, name: i.name, hint: 'already in family' }))
      let more: Pick[] = []
      try {
        if (tab === 'mf') {
          // loosen the search word by word if nothing matches
          let words = term.split(/\s+/)
          let found = await store.searchSchemes(term)
          while (!found.length && words.length > 1) {
            words = words.slice(0, -1)
            found = await store.searchSchemes(words.join(' '))
          }
          more = found
            .filter((s) => /direct/i.test(s.name) || !/regular/i.test(s.name))
            .map((s) => ({ kind: 'MF' as const, code: s.code, name: s.name, hint: `NAV ${s.nav} · ${fmtDate(s.nav_date)}`, px: { date: s.nav_date, price: s.nav } }))
        } else more = (await store.searchStocks(term)).map((s) => ({ kind: guessKind(s.symbol), code: s.symbol, name: s.name || s.symbol, hint: `₹${s.close} · ${fmtDate(s.date)}`, px: { date: s.date, price: s.close } }))
      } catch {
        /* offline */
      }
      const seen = new Set(fam.map((f) => f.kind + f.code))
      setResults([...fam, ...more.filter((m) => !seen.has(m.kind + m.code))].slice(0, 25))
    }, 250)
    return () => clearTimeout(t)
  }, [q, tab, db.instruments, store])

  // default stock price = latest close
  useEffect(() => {
    if (pick && !isMF && latest && !px) setPx(String(latest.price))
  }, [pick, isMF, latest, px])

  const rank = useMemo(() => {
    const cat = inst?.category ?? (pick ? guessCategory(pick.name, pick.kind) : 'Other')
    const tc = inst?.tax_class ?? (pick ? guessTaxClass(pick.name, cat, pick.kind) : 'equity')
    return tc.startsWith('equity') ? { list: d.where.equity, label: 'equity' } : { list: d.where.other, label: 'non-equity' }
  }, [inst, pick, d.where])

  if (!can('add')) return <Page title="Invest">You don't have permission to add investments. Ask the admin.</Page>

  const ensureInstrument = async (): Promise<Instrument> => {
    if (inst) return inst
    const p = pick!
    const found = db.instruments.find((i) => i.kind === p.kind && i.code === p.code)
    if (found) return found
    const cat = p.kind === 'STOCK' ? 'Stocks' : guessCategory(p.name, p.kind)
    const el = defaultExitLoad(p.kind, cat)
    const [row] = await store.insert<Instrument>('instruments', [
      { kind: p.kind, code: p.code, name: p.name, category: cat, tax_class: guessTaxClass(p.name, cat, p.kind), exit_load_pct: el.pct, exit_load_days: el.days, keep: true },
    ])
    return row
  }

  const submit = async () => {
    if (!pick || !holder) return
    setBusy(true)
    try {
      const i = await ensureInstrument()
      if (store.mode === 'demo' && pick.px && !d.book.latest(priceKey(i))) await store.addPrices?.([{ key: priceKey(i), ...pick.px }])
      if (mode === 'sip') {
        const amt = Number(amount)
        const dd = Number(day)
        let start = monthDate(Number(d.today.slice(0, 4)), Number(d.today.slice(5, 7)), dd)
        if (start <= d.today) start = addMonths(start, 1)
        await store.insert('sips', [{ holder_id: holder, instrument_id: i.id, amount: amt, day: dd, start_date: start, active: true, last_run_date: null, ...(i.kind !== 'MF' ? { charges: Number(charges) || 0 } : {}) }])
        toast(`SIP started — first instalment ${fmtDate(start)}`)
      } else if (isMF) {
        const amt = Number(amount)
        const eff = after ? addDays(date, 1) : date
        const pts = await store.pricesFrom(priceKey(i), eff)
        const p = pts.find((x) => x.date <= d.today && x.date <= addDays(eff, 7))
        const usePrice = p ?? (store.mode === 'demo' ? (d.book.latest(priceKey(i)) ?? pick.px ?? null) : null)
        if (usePrice) {
          const { units } = unitsFor(amt, usePrice.price, i, db.rules)
          await store.insert('txns', [{ holder_id: holder, instrument_id: i.id, date: usePrice.date, type: 'BUY', units, price: usePrice.price, amount: amt, status: 'done', source: 'manual', after_cutoff: after, note: p ? null : 'demo: latest NAV used' }])
          toast(`Bought ${units} units @ ${usePrice.price} (NAV ${fmtDate(usePrice.date)})`)
        } else {
          await store.insert('txns', [{ holder_id: holder, instrument_id: i.id, date, type: 'BUY', units: null, price: null, amount: amt, status: 'pending', source: 'manual', after_cutoff: after }])
          toast('Order saved — units will be added when AMFI publishes the NAV (tonight)')
        }
      } else {
        const n = Math.floor(Number(qty))
        const price = Number(px)
        await store.insert('txns', [{ holder_id: holder, instrument_id: i.id, date, type: 'BUY', units: n, price, amount: n * price, status: 'done', source: 'manual' }])
        toast(`Bought ${n} × ${i.code} @ ₹${price}`)
      }
      await reload()
      nav(`/h/${holder}/${i.id}`)
    } catch (e) {
      alert('Could not save: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const preview = isMF && amount && latest ? unitsFor(Number(amount), latest.price, { kind: 'MF' } as Instrument, db.rules).units : null
  const valid = pick && holder && (mode === 'sip' ? Number(amount) >= 100 : isMF ? Number(amount) > 0 : Number(qty) >= 1 && Number(px) > 0)

  return (
    <Page title="Invest">
      <Link to="/plan" className="block rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 hover:bg-teal-100">
        💡 <b>Not sure where to put new money?</b> Answer 5 quick questions and get a split based on your current holdings →
      </Link>
      <Card>
        <div className="space-y-4">
          <Field label="For whom">
            <Chips value={holder} onChange={setHolder} options={visibleHolders.map((h) => ({ v: h.id, label: h.name }))} />
          </Field>
          <Field label="How">
            <Chips
              value={mode}
              onChange={setMode}
              options={[
                { v: 'once', label: 'One-time (lumpsum)' },
                { v: 'sip', label: 'Monthly SIP' },
              ]}
            />
          </Field>

          {!pick ? (
            <div className="space-y-2">
              <Chips
                value={tab}
                onChange={(v) => (setTab(v), setResults([]))}
                options={[
                  { v: 'mf', label: 'Mutual fund' },
                  { v: 'stock', label: 'Stock / ETF' },
                ]}
              />
              <input autoFocus placeholder={tab === 'mf' ? 'Search fund name, e.g. "parag flexi direct"' : 'Search NSE symbol, e.g. NIFTYBEES'} value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
                {results.map((r) => (
                  <button key={r.kind + r.code} onClick={() => (setPick(r), setQ(''))} className="block w-full p-2.5 text-left hover:bg-teal-50">
                    <div className="text-sm">{r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.kind === 'MF' ? `AMFI ${r.code}` : r.code} · {r.hint}
                    </div>
                  </button>
                ))}
                {q.length >= 2 && !results.length && <div className="p-3 text-sm text-slate-500">No match yet. Tip: search "Direct Growth" funds.</div>}
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 p-3">
              <div>
                <div className="text-sm font-medium">{pick.name}</div>
                <div className="text-xs text-slate-500">
                  {pick.kind === 'MF' ? `AMFI ${pick.code}` : `NSE ${pick.code}`}
                  {latest && ` · last ${isMF ? 'NAV' : 'close'} ₹${latest.price} (${fmtDate(latest.date)})`}
                </div>
              </div>
              <button className="text-sm text-teal-700" onClick={() => setPick(null)}>
                Change
              </button>
            </div>
          )}

          {pick && mode === 'once' && isMF && (
            <>
              <Field label="Amount (₹)" hint={preview != null ? `≈ ${preview} units at last NAV (after 0.005% stamp duty)` : undefined}>
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Order date">
                  <input type="date" value={date} max={d.today} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <label className="mt-6 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="w-auto" checked={after} onChange={(e) => setAfter(e.target.checked)} /> Placed after 3 PM
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Like Groww: before 3 PM you get that day's NAV, after 3 PM the next working day's. If AMFI hasn't published it yet, the order waits and fills automatically tonight.
              </p>
            </>
          )}
          {pick && mode === 'once' && !isMF && (
            <div className="grid grid-cols-3 gap-3">
              <Field label="Quantity">
                <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
              <Field label="Price you paid (₹)">
                <input inputMode="decimal" value={px} onChange={(e) => setPx(e.target.value)} />
              </Field>
              <Field label="Date">
                <input type="date" value={date} max={d.today} onChange={(e) => setDate(e.target.value)} />
              </Field>
            </div>
          )}
          {pick && mode === 'sip' && !isMF && (
            <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900">
              Stocks/ETFs can only be bought in <b>whole units</b>, so each month's actual amount changes with the price (that's why SILVERBEES shows ₹2,249 one month and ₹2,367 the next).
              The app buys as many whole units as fit in the amount, after keeping aside the charges below.
              <div className="mt-2 w-40">
                <Field label="Keep aside for charges (₹)">
                  <input inputMode="decimal" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="e.g. 60" />
                </Field>
              </div>
            </div>
          )}
          {pick && mode === 'sip' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly amount (₹)">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="SIP date (day of month)" hint="Holiday? Next working day's price is used.">
                <input inputMode="numeric" value={day} onChange={(e) => setDay(String(Math.max(1, Math.min(28, Number(e.target.value) || 1))))} />
              </Field>
            </div>
          )}
          <Btn className="w-full" disabled={!valid || busy} onClick={submit}>
            {busy ? 'Saving…' : mode === 'sip' ? 'Start SIP' : 'Invest'}
          </Btn>
        </div>
      </Card>

      {pick && rank.list.length > 1 && (
        <Card title={`Tax-smart choice of account (${rank.label})`}>
          <ol className="space-y-2 text-sm">
            {rank.list.map((r, idx) => (
              <li key={r.person.id} className="flex gap-2">
                <span className="font-semibold text-slate-400">{idx + 1}.</span>
                <span>
                  <b>{r.members.map((m) => m.name).join(' + ')}</b> {idx === 0 && <Badge tone="green">best</Badge>}
                  <span className="block text-xs text-slate-600">{r.reason}</span>
                </span>
              </li>
            ))}
          </ol>
          {holder && rank.list[0] && !rank.list[0].members.some((m) => m.id === holder) && (
            <p className="mt-2 text-xs text-amber-800">You picked {holderName(holder)}. {rank.list[0].person.name}'s account would likely save more tax later.</p>
          )}
        </Card>
      )}
    </Page>
  )
}
