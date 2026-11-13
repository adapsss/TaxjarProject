import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { TransactionDrawer } from '../components/Overlays'
import { HomeView } from './Home'
import { TaxJarView } from './TaxJar'

/**
 * /transactions/:id — one payment in a side drawer: amount, payer, reference, the "why",
 * and the reservation breakdown with Undo. It opens over the screen you came from
 * (Home or Tax Jar), and closing returns there.
 */
export default function TransactionDetail() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from === '/tax-jar' ? '/tax-jar' : '/'

  return (
    <AppShell>
      {from === '/tax-jar' ? <TaxJarView /> : <HomeView />}
      <TransactionDrawer id={id} onClose={() => nav(from)} />
    </AppShell>
  )
}
