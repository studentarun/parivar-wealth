import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { AppProvider, useApp } from './app/state'
import { Btn, Card, Field } from './app/ui'
import { DemoStore } from './data/demo'
import { LiveStore, makeClient } from './data/live'
import type { AppUser } from './core/types'
import Home from './pages/Home'
import Holdings from './pages/Holdings'
import HoldingDetail from './pages/HoldingDetail'
import Invest from './pages/Invest'
import Withdraw from './pages/Withdraw'
import Sips from './pages/Sips'
import Tax from './pages/Tax'
import More from './pages/More'
import Family from './pages/settings/Family'
import Funds from './pages/settings/Funds'
import Rules from './pages/settings/Rules'
import Users from './pages/settings/Users'
import Import from './pages/settings/Import'
import Activity from './pages/settings/Activity'
import History from './pages/History'
import Plan from './pages/Plan'
const Trends = lazy(() => import('./pages/Trends'))
const Fire = lazy(() => import('./pages/Fire'))
import Wealth from './pages/wealth/Wealth'
import AssetEdit from './pages/wealth/AssetEdit'
import AssetDetail from './pages/wealth/AssetDetail'
import Metals from './pages/settings/Metals'

const ENV_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ENV_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function readConfig(): { url: string; key: string } | null {
  if (ENV_URL && ENV_KEY) return { url: ENV_URL, key: ENV_KEY }
  try {
    const c = JSON.parse(localStorage.getItem('pw-config') || 'null')
    return c?.url && c?.key ? c : null
  } catch {
    return null
  }
}
const getMode = () => {
  try {
    return localStorage.getItem('pw-mode')
  } catch {
    return null
  }
}
const setMode = (m: string | null) => {
  try {
    if (m) localStorage.setItem('pw-mode', m)
    else localStorage.removeItem('pw-mode')
  } catch {
    /* ignore */
  }
}

export default function App() {
  const [demo, setDemo] = useState(() => new URLSearchParams(location.search).has('demo') || getMode() === 'demo')
  const cfg = useMemo(readConfig, [])
  if (demo) return <DemoBoot onExit={() => (setMode(null), setDemo(false))} />
  if (!cfg) return <Welcome onDemo={() => (setMode('demo'), setDemo(true))} />
  return <LiveBoot url={cfg.url} anon={cfg.key} />
}

function DemoBoot({ onExit }: { onExit: () => void }) {
  const store = useMemo(() => new DemoStore(), [])
  const [me, setMe] = useState<AppUser | null>(null)
  useEffect(() => {
    store.currentUser().then(setMe)
  }, [store])
  if (!me) return null
  return (
    <AppProvider store={store} me={me}>
      <Shell banner={<DemoBanner onExit={onExit} />} />
    </AppProvider>
  )
}

function DemoBanner({ onExit }: { onExit: () => void }) {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-900">
      Demo mode — data stays only in this browser.{' '}
      {readConfig() && (
        <button className="underline" onClick={onExit}>
          Switch to family app
        </button>
      )}
    </div>
  )
}

function Welcome({ onDemo }: { onDemo: () => void }) {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <div className="pt-8 text-center">
        <img src="icon-192.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-semibold">Parivar Wealth</h1>
        <p className="text-sm text-slate-600">Your family's investments, tax planner and FIRE tracker.</p>
      </div>
      <Card title="Try it now">
        <p className="mb-3 text-sm text-slate-600">Load your Excel tracker and explore. Nothing leaves this browser.</p>
        <Btn onClick={onDemo} className="w-full">
          Open demo
        </Btn>
      </Card>
      <Card title="Connect the family database (one-time setup)">
        <div className="space-y-3">
          <Field label="Project URL">
            <input value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://xxxx.supabase.co" />
          </Field>
          <Field label="Anon public key">
            <input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="eyJ..." />
          </Field>
          <Btn
            variant="ghost"
            className="w-full"
            disabled={!url || !key}
            onClick={() => {
              localStorage.setItem('pw-config', JSON.stringify({ url, key }))
              location.reload()
            }}
          >
            Connect
          </Btn>
        </div>
      </Card>
    </div>
  )
}

function LiveBoot({ url, anon }: { url: string; anon: string }) {
  const sb = useMemo(() => makeClient(url, anon), [url, anon])
  const store = useMemo(() => new LiveStore(sb), [sb])
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<AppUser | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])
  useEffect(() => {
    if (!session) return setMe(null)
    store.currentUser().then(setMe).catch((e) => setErr(String(e.message ?? e)))
  }, [session, store])

  if (session === undefined) return <Splash />
  if (!session) return <Login sb={sb} />
  if (err) return <div className="p-6 text-rose-700">Could not load your account: {err}</div>
  if (!me) return <Splash />
  if (me.role === 'pending')
    return (
      <div className="mx-auto max-w-md space-y-4 p-6 pt-16 text-center">
        <h1 className="text-xl font-semibold">Waiting for approval</h1>
        <p className="text-sm text-slate-600">
          Hi {me.display_name}! Ask the family admin to open <b>More → Family logins</b> and give you access.
        </p>
        <Btn variant="ghost" onClick={() => location.reload()}>
          Check again
        </Btn>{' '}
        <Btn variant="ghost" onClick={() => sb.auth.signOut()}>
          Sign out
        </Btn>
      </div>
    )
  return (
    <AppProvider store={store} me={me}>
      <Shell />
    </AppProvider>
  )
}

const Splash = () => <div className="p-10 text-center text-slate-500">Loading…</div>

function Login({ sb }: { sb: SupabaseClient }) {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setMsg(null)
    const r =
      mode === 'in'
        ? await sb.auth.signInWithPassword({ email, password: pw })
        : await sb.auth.signUp({ email, password: pw, options: { data: { name } } })
    setBusy(false)
    if (r.error) setMsg(r.error.message)
    else if (mode === 'up' && !r.data.session) setMsg('Account created. Check your email to confirm, then sign in.')
  }
  return (
    <div className="mx-auto max-w-sm space-y-4 p-6 pt-14">
      <div className="text-center">
        <img src="icon-192.png" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-semibold">Parivar Wealth</h1>
      </div>
      <Card>
        <div className="space-y-3">
          {mode === 'up' && (
            <Field label="Your name">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value.trim())} autoComplete="email" />
          </Field>
          <Field label="Password" hint={mode === 'up' ? 'At least 6 characters' : undefined}>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </Field>
          {msg && <p className="text-sm text-rose-700">{msg}</p>}
          <Btn className="w-full" disabled={busy || !email || pw.length < 6} onClick={go}>
            {mode === 'in' ? 'Sign in' : 'Create account'}
          </Btn>
          <button className="w-full text-center text-sm text-teal-700" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
            {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
        </div>
      </Card>
      <p className="text-center text-xs text-slate-500">
        <button className="underline" onClick={() => (localStorage.setItem('pw-mode', 'demo'), location.reload())}>
          Open demo instead
        </button>
      </p>
    </div>
  )
}

const NAV = [
  { to: '/', label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { to: '/holdings', label: 'Holdings', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { to: '/wealth', label: 'Wealth', icon: 'M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6' },
  { to: '/invest', label: 'Invest', icon: 'M12 5v14M5 12h14' },
  { to: '/tax', label: 'Tax tips', icon: 'M9 14l2 2 4-4M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z' },
  { to: '/more', label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
]

function Shell({ banner }: { banner?: React.ReactNode }) {
  const { loading, error, d } = useApp()
  const acts = d.advice.filter((a) => a.level === 'act' || a.level === 'warn').length
  return (
    <HashRouter>
      {banner}
      <div className="mx-auto flex max-w-5xl">
        <nav className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col gap-1 border-r border-slate-200 p-4 md:flex">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <img src="favicon.svg" className="h-7 w-7" alt="" /> Parivar Wealth
          </div>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-50 font-medium text-teal-800' : 'text-slate-700 hover:bg-slate-100'}`}>
              <Icon d={n.icon} />
              {n.label}
              {n.to === '/tax' && acts > 0 && <span className="ml-auto rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{acts}</span>}
            </NavLink>
          ))}
        </nav>
        <main className="min-h-screen flex-1 px-4 pb-24 pt-4 md:px-8 md:pb-10">
          {error && <div className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Problem loading data: {error}</div>}
          {loading ? (
            <div className="p-10 text-center text-slate-500">Loading…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/holdings" element={<Holdings />} />
              <Route path="/h/:holder/:inst" element={<HoldingDetail />} />
              <Route path="/invest" element={<Invest />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/fire" element={<Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}><Fire /></Suspense>} />
              <Route path="/wealth" element={<Wealth />} />
              <Route path="/wealth/new" element={<AssetEdit />} />
              <Route path="/wealth/:id" element={<AssetDetail />} />
              <Route path="/wealth/:id/edit" element={<AssetEdit />} />
              <Route path="/more/metals" element={<Metals />} />
              <Route path="/trends" element={<Suspense fallback={<div className="p-8 text-center text-slate-500">Loading…</div>}><Trends /></Suspense>} />
              <Route path="/withdraw/:holder/:inst" element={<Withdraw />} />
              <Route path="/sips" element={<Sips />} />
              <Route path="/history" element={<History />} />
              <Route path="/tax" element={<Tax />} />
              <Route path="/more" element={<More />} />
              <Route path="/more/family" element={<Family />} />
              <Route path="/more/funds" element={<Funds />} />
              <Route path="/more/rules" element={<Rules />} />
              <Route path="/more/users" element={<Users />} />
              <Route path="/more/import" element={<Import />} />
              <Route path="/more/activity" element={<Activity />} />
            </Routes>
          )}
        </main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-teal-700' : 'text-slate-500'}`}>
            <Icon d={n.icon} />
            {n.label}
            {n.to === '/tax' && acts > 0 && <span className="absolute right-2 top-1 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{acts}</span>}
          </NavLink>
        ))}
      </nav>
    </HashRouter>
  )
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
)
