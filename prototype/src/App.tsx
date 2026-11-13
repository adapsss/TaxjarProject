import { Route, Routes } from 'react-router-dom'
import { ReservationDrawer, TaxToast, WorkQuestionDialog } from './components/Overlays'
import { Sidebar } from './components/Sidebar'
import { Home } from './screens/Home'
import { PayTax } from './screens/PayTax'
import { Setup } from './screens/Setup'
import { TaxJar } from './screens/TaxJar'

export default function App() {
  return (
    <div className="flex min-h-screen min-w-[1180px]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-10 pt-9 pb-16">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/tax-jar" element={<TaxJar />} />
            <Route path="/tax-jar/pay" element={<PayTax />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>
        <footer className="border-t border-line py-3 text-center text-[11.5px] text-muted">
          Hackathon prototype · not affiliated with Wise · synthetic data only
        </footer>
      </div>
      <TaxToast />
      <WorkQuestionDialog />
      <ReservationDrawer />
    </div>
  )
}
