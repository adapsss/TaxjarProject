import { useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../state/store'
import { DemoSheet } from './DemoSheet'
import { DemoSheetContext } from './demoSheetContext'
import { LeaveConfirm } from './LeaveConfirm'
import { LeaveGuardContext, type LeaveGuard } from './leaveGuardContext'
import { NoticeToast, TaxToast, WorkQuestionDialog } from './Overlays'
import { ActivityIcon, HomeIcon, JarIcon, SettingsIcon } from './ui'

const TABS = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/tax-jar', label: 'Tax Jar', icon: JarIcon },
  { to: '/activity', label: 'Payments', icon: ActivityIcon },
  { to: '/onboarding', label: 'Settings', icon: SettingsIcon },
]

/** The iOS-looking device frame, status bar, tab bar and the app's global overlays. */
export function AppShell({ children }: { children: ReactNode }) {
  const { profile, connected, screen } = useStore()
  const location = useLocation()
  const viewport = useRef<HTMLElement>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const nav = useNavigate()
  const [guard, setGuard] = useState<LeaveGuard | null>(null)
  // Where the person was heading when "Are you sure?" interrupted them.
  const [pending, setPending] = useState<string | null>(null)
  const request = (to: string) => (guard ? setPending(to) : nav(to))
  const onboarding = location.pathname === '/onboarding' && !profile.enabled
  const tabs = !onboarding && location.pathname !== '/tax-jar/pay'

  // The screen itself, ignoring a payment sheet opened over it.
  const screenPath = location.pathname.startsWith('/transactions/')
    ? ((location.state as { from?: string } | null)?.from ?? '/activity')
    : location.pathname
  useEffect(() => {
    viewport.current?.scrollTo?.({ top: 0 })
  }, [screenPath])

  const screenStyle = { '--tab-offset': tabs ? '90px' : '12px' } as CSSProperties

  return (
    <DemoSheetContext.Provider value={() => setDemoOpen(true)}>
      <LeaveGuardContext.Provider value={{ guard, setGuard, request }}>
      <div className="device-stage">
        <div className="device">
          <div className="device-screen" style={screenStyle}>
            <span className="dynamic-island" aria-hidden="true" />
            <StatusBar />
            {!connected && screen === 'ready' && (
              <p role="alert" className="relative z-20 flex items-center justify-center gap-2 bg-amber-soft px-4 py-2 text-[14px] font-semibold text-amber-ink">
                <span className="size-2 animate-pulse rounded-full bg-amber" />
                Connection lost. Reconnecting…
              </p>
            )}
            <main ref={viewport} className="app-viewport">
              {children}
            </main>
            {tabs && <TabBar />}
            <TaxToast />
            <WorkQuestionDialog />
            <NoticeToast />
            <DemoSheet open={demoOpen} onClose={() => setDemoOpen(false)} />
            {pending !== null && guard && (
              <LeaveConfirm
                body={guard.body}
                onStay={() => setPending(null)}
                onLeave={() => {
                  const to = pending
                  setPending(null)
                  setGuard(null)
                  nav(to)
                }}
              />
            )}
          </div>
        </div>
        <p className="device-caption">Hackathon prototype · Wise-inspired UI · not affiliated with Wise · synthetic data only</p>
      </div>
      </LeaveGuardContext.Provider>
    </DemoSheetContext.Provider>
  )
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span className="w-[60px] text-left">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg viewBox="0 0 18 12" className="h-3 w-[18px]" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="6" width="3" height="6" rx="0.8" />
          <rect x="9" y="3.5" width="3" height="8.5" rx="0.8" />
          <rect x="13.5" y="1" width="3" height="11" rx="0.8" />
        </svg>
        <svg viewBox="0 0 16 12" className="h-3 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M1.5 4.2a9.5 9.5 0 0 1 13 0M4.2 7a5.6 5.6 0 0 1 7.6 0M7 9.8a1.7 1.7 0 0 1 2 0" />
        </svg>
        <svg viewBox="0 0 25 12" className="h-3 w-[25px]" fill="none">
          <rect x="0.7" y="0.7" width="21" height="10.6" rx="3" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
          <rect x="2.3" y="2.3" width="17.8" height="7.4" rx="1.8" fill="currentColor" />
          <path d="M23.2 4v4c1.2-.3 1.7-.9 1.7-2s-.5-1.7-1.7-2Z" fill="currentColor" opacity="0.55" />
        </svg>
      </span>
    </div>
  )
}

function TabBar() {
  const { guard, request } = useContext(LeaveGuardContext)
  return (
    <nav className="tab-bar" aria-label="Main">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={(e) => {
            // Unsaved changes on this screen: ask first, then go.
            if (guard) {
              e.preventDefault()
              request(to)
            }
          }}
          className={({ isActive }) =>
            `press flex w-[72px] flex-col items-center gap-1 rounded-2xl py-1 ${isActive ? 'text-forest' : 'text-[#87887f]'}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={`size-[25px] ${isActive ? 'stroke-[2.1]' : 'stroke-[1.8]'}`} />
              <span className={`text-[11px] tracking-[-0.01em] ${isActive ? 'font-semibold' : 'font-medium'}`}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
      <span className="home-indicator" aria-hidden="true" />
    </nav>
  )
}
