import { useEffect, useState } from 'react'
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
      <Card>
        <p className="text-sm text-slate-600">
          Family members open the app link, tap <b>Create an account</b>, and appear here as <Badge tone="amber">pending</Badge>. Approve them and choose what they can do.
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
