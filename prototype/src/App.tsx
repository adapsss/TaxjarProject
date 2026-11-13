import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { Activity } from './screens/Activity'
import { Home } from './screens/Home'
import { PayTax } from './screens/PayTax'
import { Setup } from './screens/Setup'
import { TaxJar } from './screens/TaxJar'

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/tax-jar" element={<TaxJar />} />
        <Route path="/tax-jar/pay" element={<PayTax />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </AppShell>
  )
}
