import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Btn, Card, Empty, inr, Page } from '../app/ui'
import { fmtDate } from '../core/dates'
import { dueDates } from '../core/sip'

export default function Sips() {
  const { db, d, visibleHolders, holderName, can, store, reload, toast } = useApp()
  const vis = new Set(visibleHolders.map((h) => h.id))
  const sips = db.sips.filter((s) => vis.has(s.holder_id))
  const total = sips.filter((s) => s.active).reduce((a, s) => a + s.amount, 0)
  const name = (id: string) => db.instruments.find((i) => i.id === id)?.name ?? '?'
  const next = (s: (typeof sips)[number]) => {
    const far = `${Number(d.today.slice(0, 4)) + 1}${d.today.slice(4)}`
    return dueDates(s, s.last_run_date, far)[0]
  }
  const act = async (fn: () => Promise<void>, msg: string) => {
    await fn()
    toast(msg)
    reload()
  }
  return (
    <Page title="SIPs" back actions={can('add') && <Link to="/invest?mode=sip"><Btn small>+ New SIP</Btn></Link>}>
      <Card>
        <div className="text-sm">
          Running SIPs: <b className="num">{inr(total)}</b> / month
        </div>
        <p className="mt-1 text-xs text-slate-500">Each instalment is bought at the NAV/close of its date (or the next working day), automatically every night.</p>
      </Card>
      {!sips.length && <Empty>No SIPs yet.</Empty>}
      {visibleHolders.map((h) => {
        const list = sips.filter((s) => s.holder_id === h.id)
        if (!list.length) return null
        return (
          <Card key={h.id} title={`${holderName(h.id)} · ${inr(list.filter((s) => s.active).reduce((a, s) => a + s.amount, 0))}/month`}>
            <div className="divide-y divide-slate-100">
              {list.map((s) => {
                const inst = db.instruments.find((i) => i.id === s.instrument_id)
                return (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm">{name(s.instrument_id)}</div>
                      <div className="text-xs text-slate-500">
                        {inr(s.amount)} on day {s.day} · last {fmtDate(s.last_run_date)} · next {s.active ? fmtDate(next(s)) : '—'}
                        {inst && !inst.keep && <Badge tone="amber">fund marked Exit</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge tone={s.active ? 'green' : 'slate'}>{s.active ? 'Running' : 'Paused'}</Badge>
                      {can('add') && (
                        <Btn small variant="ghost" onClick={() => act(() => store.update('sips', s.id, { active: !s.active, ...(s.active ? {} : { last_run_date: d.today }) }), s.active ? 'SIP paused' : 'SIP resumed from next date')}>
                          {s.active ? 'Pause' : 'Resume'}
                        </Btn>
                      )}
                      {can('add') && (
                        <Btn
                          small
                          variant="ghost"
                          onClick={() => {
                            const v = prompt('New monthly amount (₹)', String(s.amount))
                            if (v && Number(v) > 0) act(() => store.update('sips', s.id, { amount: Number(v) }), 'Amount updated')
                          }}
                        >
                          Edit
                        </Btn>
                      )}
                      {can('delete') && (
                        <Btn small variant="ghost" className="text-rose-700" onClick={() => confirm('Stop this SIP for good? Past instalments stay.') && act(() => store.remove('sips', s.id), 'SIP stopped')}>
                          Stop
                        </Btn>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}
    </Page>
  )
}
