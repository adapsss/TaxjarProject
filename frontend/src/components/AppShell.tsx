import type { ReactNode } from 'react'
import { TaxToast, WorkQuestionDialog } from './Overlays'
import { Sidebar } from './Sidebar'

/**
 * The desktop frame around every app screen: sidebar, content column, prototype label,
 * sized to work from a 1024px projector up (the sidebar and gutters widen at 1280px),
 * and the two live overlays (toast, work question). The route table in App.tsx is frozen,
 * so each screen file wraps itself in this instead of App.tsx owning a layout route.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen min-w-[1000px]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 pt-9 pb-16 xl:px-10">{children}</main>
        <footer className="border-t border-line py-3 text-center text-[11.5px] text-muted">
          Hackathon prototype · not affiliated with Wise · synthetic data only
        </footer>
      </div>
      <TaxToast />
      <WorkQuestionDialog />
    </div>
  )
}
