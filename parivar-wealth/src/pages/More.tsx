import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../app/state'
import { Badge, Card, Page } from '../app/ui'

export default function More() {
  const { me, can, store } = useApp()
  const items: [string, string, string, boolean][] = [
    ['/more/family', 'Family members', 'Names, yearly income, clubbing — used for tax tips', true],
    ['/more/funds', 'Funds & stocks', 'Category, tax type, keep or exit, exit load', true],
    ['/fire', 'FIRE plan', 'Your number, when you can retire, monthly investing needed', true],
    ['/trends', 'Trends', 'Charts: value over time, monthly investing, SIP growth', true],
    ['/more/metals', 'Gold & silver rates', 'IBJA rates used to value gold and silver', true],
    ['/plan', 'Invest new money', 'Questions → where to put it, which account', can('add')],
    ['/sips', 'SIPs', 'Pause, edit or stop monthly SIPs', true],
    ['/history', 'History', 'All entries and profit booked per year', true],
    ['/more/import', 'Import Excel', 'Load your existing tracker', can('settings')],
    ['/more/rules', 'Tax rules', 'Rates & limits — update after every Budget', true],
    ['/more/users', 'Family logins & permissions', 'Who can see, add, withdraw, delete', me.role === 'admin'],
    ['/more/activity', 'Activity log', 'Who changed what, when', me.role === 'admin'],
  ]
  return (
    <Page title="More">
      <Card>
        <div className="text-sm">
          Signed in as <b>{me.display_name}</b> <Badge tone="teal">{me.role}</Badge> {store.mode === 'demo' && <Badge tone="amber">demo</Badge>}
        </div>
        <div className="mt-1 text-xs text-slate-500">{me.email}</div>
      </Card>
      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {items
          .filter((i) => i[3])
          .map(([to, t, s]) => (
            <Link key={to} to={to} className="block p-3 hover:bg-slate-50">
              <div className="text-sm font-medium">{t}</div>
              <div className="text-xs text-slate-500">{s}</div>
            </Link>
          ))}
      </div>
      {store.mode === 'live' && <PriceStatus />}
      <Card title="Install on your phone">
        <p className="text-sm text-slate-600">Open this page in Chrome on Android → ⋮ menu → <b>Add to Home screen</b> / <b>Install app</b>. It opens like a normal app.</p>
      </Card>
      <div className="flex gap-4 text-sm">
        {store.mode === 'live' && (
          <button className="text-rose-700" onClick={() => store.signOut().then(() => location.reload())}>
            Sign out
          </button>
        )}
        {store.mode === 'demo' && (
          <button
            className="text-rose-700"
            onClick={() => {
              if (confirm('Delete all demo data in this browser?')) store.reset!().then(() => location.reload())
            }}
          >
            Clear demo data
          </button>
        )}
      </div>
    </Page>
  )
}

function PriceStatus() {
  const { store } = useApp()
  const [st, setSt] = useState<{ ok: boolean; at: string; lines: string[] } | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    store.getSetting<{ ok: boolean; at: string; lines: string[] }>('nightly_status').then(setSt)
  }, [store])
  return (
    <Card title="Nightly price update" right={st && <Badge tone={st.ok ? 'green' : 'red'}>{st.ok ? 'OK' : 'Problem'}</Badge>}>
      {!st ? (
        <p className="text-sm text-slate-500">Hasn't run yet.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">Last run: {new Date(st.at).toLocaleString('en-IN')}</p>
          <button className="mt-1 text-xs text-teal-700" onClick={() => setOpen(!open)}>
            {open ? 'Hide' : 'Show'} details
          </button>
          {open && <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px]">{st.lines.join('\n')}</pre>}
        </>
      )}
    </Card>
  )
}
