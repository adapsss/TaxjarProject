import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatMoney } from '../lib/money'
import { useScenarios } from '../state/scenarios'
import { useStore, type PresetChoice } from '../state/store'
import { JarIcon, Spinner } from './ui'

const NAV = [
  { to: '/', label: 'Home', icon: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z' },
  { to: '/tax-jar', label: 'Tax Jar', jar: true },
  { to: '/onboarding', label: 'Tax settings', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z' },
]

// Filled / Empty / Not set up reset the backend to that state; Live leaves it as it is.
const PRESETS: { id: PresetChoice; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'filled', label: 'Filled' },
  { id: 'empty', label: 'Empty' },
  { id: 'not-set-up', label: 'Not set up' },
  { id: 'loading', label: 'Loading' },
  { id: 'error', label: 'Error' },
]

const HIDE_KEY = 'taxjar.demoControls.hidden'
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export function Sidebar() {
  const [hidden, setHidden] = useState(readHidden)
  const toggle = (v: boolean) => {
    setHidden(v)
    try {
      localStorage.setItem(HIDE_KEY, v ? '1' : '0')
    } catch {
      // Private mode: the choice just lasts for this page.
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[212px] md:flex shrink-0 flex-col border-r border-line bg-white px-3 pt-6 pb-4 xl:w-[248px] xl:px-4">
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <span className="grid size-9 place-items-center rounded-xl bg-lime text-forest">
          <JarIcon className="size-5" />
        </span>
        <span className="text-[19px] font-extrabold tracking-tight text-forest">Tax Jar</span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                  isActive ? 'bg-lime-soft font-bold text-forest' : 'font-medium text-ink hover:bg-canvas'
                }`
              }
            >
              {n.jar ? (
                <JarIcon className="size-5" />
              ) : (
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
              )}
              {n.label}
            </NavLink>
        ))}
      </nav>
      <div className="flex-1" />
      {hidden ? (
        <button onClick={() => toggle(false)} className="cursor-pointer self-start rounded-full px-2 py-1 text-[11px] font-semibold text-muted/60 hover:bg-canvas hover:text-ink">
          Show demo controls
        </button>
      ) : (
        <DemoControls onHide={() => toggle(true)} />
      )}
    </aside>
  )
}

/** Stage helpers, visibly not part of the product. Hide them for a clean screen; the simulator tab does the same job. */
function DemoControls({ onHide }: { onHide: () => void }) {
  const { simulate, busy, preset, setPreset, failNext, setFailNext } = useStore()
  const { scenarios } = useScenarios()
  return (
    <div className="rounded-2xl border border-dashed border-forest/25 bg-[#20271b] p-3.5 text-white">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[10.5px] font-bold tracking-[0.12em] text-lime uppercase">Demo controls</span>
        <button onClick={onHide} className="cursor-pointer text-[10.5px] font-semibold text-white/45 hover:text-white">
          Hide
        </button>
      </div>
      <div className="mb-3 flex flex-col gap-1.5">
        {scenarios.slice(0, 3).map((s) => (
          <button
            key={s.id}
            disabled={!!busy}
            // Failures surface on the screen that asked; a rejected demo click needs no handling here.
            onClick={() => simulate(s, `sim:${s.id}`).catch(() => {})}
            className="flex cursor-pointer items-center justify-between rounded-lg bg-white/[0.07] px-2.5 py-2 text-left text-[12.5px] transition-colors hover:bg-white/[0.13] disabled:cursor-wait disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{s.senderName}</span>
              <span className="block truncate text-[11px] text-white/50">{s.reference}</span>
            </span>
            <span className="num flex items-center gap-1.5 font-semibold text-lime">
              {busy === `sim:${s.id}` && <Spinner className="size-3" />}
              {formatMoney(s.amount, s.currency)}
            </span>
          </button>
        ))}
      </div>
      <label htmlFor="demo-state" className="mb-1 block text-[11px] text-white/55">Screen state</label>
      <select
        id="demo-state"
        value={preset}
        onChange={(e) => void setPreset(e.target.value as PresetChoice)}
        className="mb-2.5 h-8 w-full cursor-pointer rounded-lg border-0 bg-white/[0.08] px-2 text-[12.5px] text-white outline-none"
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id} className="text-ink">
            {p.label}
          </option>
        ))}
      </select>
      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-white/75">
        <input type="checkbox" checked={failNext} onChange={(e) => setFailNext(e.target.checked)} className="accent-lime" />
        Next action fails
      </label>
      <a href="/simulator" target="_blank" rel="noreferrer" className="mt-3 block rounded-lg bg-white/[0.07] py-1.5 text-center text-[12px] font-semibold text-lime hover:bg-white/[0.13]">
        Open simulator in a new tab ↗
      </a>
    </div>
  )
}

/** Phones: the wordmark on top and the same three places as tabs at the bottom, in thumb reach. */
export function MobileNav() {
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2.5 border-b border-line bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <span className="grid size-8 place-items-center rounded-lg bg-lime text-forest">
          <JarIcon className="size-[18px]" />
        </span>
        <span className="text-[17px] font-extrabold tracking-tight text-forest">Tax Jar</span>
        <a href="/simulator" target="_blank" rel="noreferrer" className="ml-auto rounded-full bg-canvas px-3 py-1.5 text-[12px] font-semibold text-muted">
          Simulator ↗
        </a>
      </header>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[12px] font-semibold ${isActive ? 'text-forest' : 'text-muted'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`grid h-7 w-12 place-items-center rounded-full ${isActive ? 'bg-lime-soft' : ''}`}>
                  {n.jar ? (
                    <JarIcon className="size-5" />
                  ) : (
                    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={n.icon} /></svg>
                  )}
                </span>
                {n.label === 'Tax settings' ? 'Settings' : n.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
