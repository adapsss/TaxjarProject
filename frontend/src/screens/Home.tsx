import { Button } from '@transferwise/components'
import { useEffect, useState } from 'react'

import { getAccount } from '../api/client.ts'

// Placeholder from Task S0. Role A replaces this file in Task A1.
export default function Home() {
  const [owner, setOwner] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getAccount()
      .then((account) => setOwner(account.owner))
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main style={{ padding: 24 }}>
      <h1>Home</h1>
      {error ? <p role="alert">Backend not reachable: {error}</p> : null}
      <Button v2 priority="primary">
        {owner ?? 'Loading…'}
      </Button>
    </main>
  )
}
