import { Route, Routes } from 'react-router-dom'

import Home from './screens/Home.tsx'
import Onboarding from './screens/Onboarding.tsx'
import PayTax from './screens/PayTax.tsx'
import Simulator from './screens/Simulator.tsx'
import TaxJar from './screens/TaxJar.tsx'
import TransactionDetail from './screens/TransactionDetail.tsx'

// The route table is frozen with the contract (Task S0).
// To build a screen, replace its file in src/screens/; do not add routes here.
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/transactions/:id" element={<TransactionDetail />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/tax-jar" element={<TaxJar />} />
      <Route path="/tax-jar/pay" element={<PayTax />} />
      <Route path="/simulator" element={<Simulator />} />
    </Routes>
  )
}
