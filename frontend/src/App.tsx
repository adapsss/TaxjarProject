import { Route, Routes, useLocation } from 'react-router-dom'

import { AppShell } from './components/AppShell.tsx'
import { TransactionSheet } from './components/TransactionSheet.tsx'
import Activity from './screens/Activity.tsx'
import Home from './screens/Home.tsx'
import Onboarding from './screens/Onboarding.tsx'
import PayTax from './screens/PayTax.tsx'
import Simulator from './screens/Simulator.tsx'
import TaxJar from './screens/TaxJar.tsx'

/** Where a payment sheet was opened from, so the screen behind it stays the same. */
export type SheetState = { from?: string } | null

// The route table follows the frozen contract (Task S0), plus /activity for the Payments tab of
// the iOS design. /transactions/:id opens one payment as a sheet over the screen it came from.
export default function App() {
  const location = useLocation()
  const from = (location.state as SheetState)?.from
  const sheetOver = location.pathname.startsWith('/transactions/') ? { ...location, pathname: from ?? '/activity' } : location

  if (location.pathname === '/simulator') return <Simulator />

  return (
    <AppShell>
      <Routes location={sheetOver}>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/tax-jar" element={<TaxJar />} />
        <Route path="/tax-jar/pay" element={<PayTax />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Routes>
        <Route path="/transactions/:id" element={<TransactionSheet />} />
        <Route path="*" element={null} />
      </Routes>
    </AppShell>
  )
}
