import { useEffect, useState } from 'react'
import { useApp } from '../../app/state'
import { Badge, Card, Page } from '../../app/ui'
import type { AuditRow } from '../../data/store'

const WORD: Record<string, string> = { txns: 'entry', sips: 'SIP', holders: 'family member', instruments: 'fund', settings: 'settings', app_users: 'login' }

export default function Activity() {
  const { store, db } = useApp()
  const [rows, setRows] = useState<AuditRow[]>([])
  useEffect(() => {
    store.audit(200).then(setRows)
  }, [store])
  const inst = (id: unknown) => db.instruments.find((i) => i.id === id)?.name
  return (
    <Page title="Activity log" back>
      <Card>
        <div className="divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <div key={r.id} className="py-2">
              <div className="flex justify-between gap-2">
                <span>
                  <Badge tone={r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'green' : 'blue'}>{r.action.toLowerCase()}</Badge> {WORD[r.tbl] ?? r.tbl}{' '}
                  {inst(r.details?.instrument_id) && <span className="text-slate-600">· {inst(r.details.instrument_id)}</span>}
                </span>
                <span className="text-xs text-slate-500">{new Date(r.at).toLocaleString('en-IN')}</span>
              </div>
              <div className="text-xs text-slate-500">{r.email}</div>
            </div>
          ))}
          {!rows.length && <div className="text-slate-500">No activity yet.</div>}
        </div>
      </Card>
    </Page>
  )
}
