import type { ButtonHTMLAttributes, ReactNode } from 'react'

/** ₹ in Indian style. short=true → ₹12.3L / ₹1.24Cr */
export function inr(n: number | null | undefined, short = false): string {
  if (n == null || !isFinite(n)) return '—'
  const neg = n < 0
  const a = Math.abs(n)
  let s: string
  if (short && a >= 1e7) s = `₹${(a / 1e7).toFixed(2)}Cr`
  else if (short && a >= 1e5) s = `₹${(a / 1e5).toFixed(2)}L`
  else if (short && a >= 1e3) s = `₹${(a / 1e3).toFixed(1)}k`
  else s = '₹' + Math.round(a).toLocaleString('en-IN')
  return (neg ? '−' : '') + s
}
export const pct = (n: number | null | undefined, d = 1) => (n == null || !isFinite(n) ? '—' : `${n >= 0 ? '+' : '−'}${Math.abs(n * 100).toFixed(d)}%`)
export const units = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 })

export function Gain({ v, base, short }: { v: number; base?: number; short?: boolean }) {
  const cls = v > 0.5 ? 'text-emerald-700' : v < -0.5 ? 'text-rose-700' : 'text-slate-500'
  return (
    <span className={`num ${cls}`}>
      {v > 0 ? '+' : ''}
      {inr(v, short)}
      {base ? <span className="ml-1 text-xs">({pct(v / base)})</span> : null}
    </span>
  )
}

export function Card({ children, className = '', title, right }: { children: ReactNode; className?: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; small?: boolean }
export function Btn({ variant = 'primary', small, className = '', ...p }: BtnProps) {
  const v = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800 disabled:bg-slate-300',
    soft: 'bg-teal-50 text-teal-800 hover:bg-teal-100',
    ghost: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
  }[variant]
  return <button {...p} className={`rounded-lg font-medium transition ${small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'} ${v} ${className}`} />
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'teal' }) {
  const t = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
    red: 'bg-rose-50 text-rose-700',
    blue: 'bg-sky-50 text-sky-700',
    teal: 'bg-teal-50 text-teal-800',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${t}`}>{children}</span>
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${value === o.v ? 'bg-teal-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs">{sub}</div>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>
}

export function Page({ title, back, children, actions }: { title: string; back?: boolean; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {back && (
            <button onClick={() => history.back()} className="rounded-lg px-2 py-1 text-slate-600 hover:bg-slate-100" aria-label="Back">
              ←
            </button>
          )}
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

/** Thin horizontal share bar (single series → one colour, value labelled in text). */
export function ShareBar({ share, tone = '#0f766e' }: { share: number; tone?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: tone }} />
    </div>
  )
}
