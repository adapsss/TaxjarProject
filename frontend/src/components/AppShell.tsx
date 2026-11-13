import type { ReactNode } from 'react'
import { useStore } from '../state/store'
import { NoticeToast, TaxToast, WorkQuestionDialog } from './Overlays'
import { MobileNav, Sidebar } from './Sidebar'

/**
 * The frame around every app screen: sidebar on screens 768px and wider (it widens at 1280px),
 * a top bar and bottom tabs on phones, the content column, the prototype label,
 * and the two live overlays (toast, work question). The route table in App.tsx is frozen,
 * so each screen file wraps itself in this instead of App.tsx owning a layout route.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <MobileNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-6 pb-28 md:px-6 md:pt-9 md:pb-16 xl:px-10">{children}</main>
        <footer className="mb-16 border-t border-line px-4 py-3 text-center text-[11.5px] text-muted md:mb-0">
          Hackathon prototype · not affiliated with Wise · synthetic data only
        </footer>
      </div>
      <TaxToast />
      <NoticeToast />
      <WorkQuestionDialog />
    </div>
  )
}

/** Live updates are down: say so instead of letting the screen silently go stale. */
function ConnectionBanner() {
  const { connected, screen } = useStore()
  if (connected || screen !== 'ready') return null
  return (
    <div role="alert" className="sticky top-0 z-30 flex items-center justify-center gap-2.5 bg-amber-soft px-4 py-2.5 text-[14px] font-semibold text-amber-ink">
      <span className="size-2 animate-pulse rounded-full bg-amber" />
      Connection lost. Reconnecting… New payments will appear once we’re back.
    </div>
  )
}
