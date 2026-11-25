import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../../app/state'
import { Badge, Btn, Card, Page } from '../../app/ui'
import type { AppUser, Perms } from '../../core/types'

const PERMS: [keyof Omit<Perms, 'holders'>, string][] = [
  ['add', 'Add investments & SIPs'],
  ['withdraw', 'Record withdrawals'],
  ['delete', 'Delete entries / stop SIPs'],
  ['settings', 'Change settings, funds, tax rules'],
]

export default function Users() {
  const { store, db, me, toast } = useApp()
  const [users, setUsers] = useState<AppUser[]>([])
  const load = () => store.listUsers().then(setUsers)
  useEffect(() => {
    load()
  }, [])
  if (me.role !== 'admin') return <Page title="Family logins" back>Only the admin can manage logins.</Page>
  const save = async (u: AppUser, p: Partial<AppUser>) => {
    await store.updateUser(u.user_id, p)
    toast('Saved')
    load()
  }
  return (
    <Page title="Family logins & permissions" back>
      <ShareCard users={users} />
      <Card>
        <p className="text-sm text-slate-600">
          Everyone sees the <b>same family portfolio</b>. People who sign up with an email you saved in <Link className="text-teal-700 underline" to="/more/family">Family members</Link> get
          in straight away as members (can add &amp; withdraw, can't delete or change settings). Anyone else waits here as <Badge tone="amber">pending</Badge> until you approve.
          {store.mode === 'demo' && ' (In demo mode there is only you.)'}
        </p>
      </Card>
      {users.map((u) => (
        <Card
          key={u.user_id}
          title={
            <span>
              {u.display_name} <span className="font-normal text-slate-500">· {u.email}</span>
            </span>
          }
          right={<Badge tone={u.role === 'admin' ? 'teal' : u.role === 'member' ? 'green' : 'amber'}>{u.role}</Badge>}
        >
          {u.user_id === me.user_id ? (
            <p className="text-xs text-slate-500">That's you (admin — can do everything).</p>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                {(['pending', 'member', 'admin'] as const).map((r) => (
                  <Btn key={r} small variant={u.role === r ? 'primary' : 'ghost'} onClick={() => save(u, { role: r })}>
                    {r === 'pending' ? 'Block' : r === 'member' ? 'Member' : 'Admin'}
                  </Btn>
                ))}
              </div>
              {u.role === 'member' && (
                <>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {PERMS.map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2">
                        <input type="checkbox" className="w-auto" checked={!!u.perms[k]} onChange={(e) => save(u, { perms: { ...u.perms, [k]: e.target.checked } })} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-slate-600">Can see (none ticked = everyone)</div>
                    <div className="flex flex-wrap gap-3">
                      {db.holders.map((h) => (
                        <label key={h.id} className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            className="w-auto"
                            checked={u.perms.holders.includes(h.id)}
                            onChange={(e) =>
                              save(u, { perms: { ...u.perms, holders: e.target.checked ? [...u.perms.holders, h.id] : u.perms.holders.filter((x) => x !== h.id) } })
                            }
                          />
                          {h.name}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
              <button className="text-xs text-rose-700" onClick={() => confirm(`Remove ${u.display_name}'s login?`) && store.removeUser(u.user_id).then(load)}>
                Remove login
              </button>
            </div>
          )}
        </Card>
      ))}
    </Page>
  )
}

function ShareCard({ users }: { users: AppUser[] }) {
  const { db, toast } = useApp()
  const link = location.origin + location.pathname
  const msg = `Join our family wealth app: ${link}\nTap "Create an account" and use the email I saved for you.`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Parivar Wealth', text: msg })
      else {
        await navigator.clipboard.writeText(msg)
        toast('Invite message copied')
      }
    } catch {
      /* cancelled */
    }
  }
  return (
    <Card title="Invite family members">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>
          Save each person's email in <Link className="text-teal-700 underline" to="/more/family">Family members</Link>.
        </li>
        <li>Send them the app link (button below — WhatsApp works).</li>
        <li>They tap <b>Create an account</b> with that email and a password of their choice.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn small onClick={share}>Share invite</Btn>
        <a className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">
          Send on WhatsApp
        </a>
      </div>
      <div className="mt-3 divide-y divide-slate-100 text-sm">
        {db.holders.map((h) => {
          const u = h.email ? users.find((x) => x.email?.toLowerCase() === h.email!.toLowerCase()) : undefined
          return (
            <div key={h.id} className="flex items-center justify-between py-1.5">
              <span>
                {h.name} <span className="text-xs text-slate-500">{h.email ?? 'no email saved'}</span>
              </span>
              {u ? <Badge tone="green">joined</Badge> : h.email ? <Badge tone="amber">not signed up yet</Badge> : <Badge>—</Badge>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
