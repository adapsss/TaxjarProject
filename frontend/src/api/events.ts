// Live updates from GET /api/events (server-sent events), per Task A3 of the frontend plan.
import { EVENTS_URL, type Transaction } from './client'

export type TxEventType = 'transaction.created' | 'reservation.created' | 'question.asked' | 'reservation.undone'
/** 'resync': this tab fell behind and the server dropped events for it, so everything must be read again. */
export type AppEvent = { type: TxEventType; transaction: Transaction } | { type: 'demo.reset' } | { type: 'resync' }

const TX_TYPES: readonly string[] = ['transaction.created', 'reservation.created', 'question.asked', 'reservation.undone']

/** One SSE frame → a typed event; null for unknown types or bad JSON. */
export function parseEvent(type: string, data: string): AppEvent | null {
  let body: unknown
  try {
    body = JSON.parse(data)
  } catch {
    return null
  }
  if (type === 'demo.reset') return { type: 'demo.reset' }
  if (type === 'resync') return { type: 'resync' }
  if (!TX_TYPES.includes(type)) return null
  const transaction = (body as { transaction?: Transaction } | null)?.transaction
  return transaction && typeof transaction.id === 'string' ? { type: type as TxEventType, transaction } : null
}

/**
 * Opens the app's one EventSource. `onOpen` runs on every (re)connect; `onDrop` when the
 * connection is lost (the browser keeps retrying on its own). Returns unsubscribe.
 */
export function subscribe(onEvent: (e: AppEvent) => void, onOpen?: () => void, onDrop?: () => void): () => void {
  const source = new EventSource(EVENTS_URL)
  for (const type of [...TX_TYPES, 'demo.reset', 'resync']) {
    source.addEventListener(type, (m) => {
      const event = parseEvent(type, (m as MessageEvent<string>).data)
      if (event) onEvent(event)
    })
  }
  if (onOpen) source.addEventListener('open', onOpen)
  if (onDrop) source.addEventListener('error', onDrop)
  return () => source.close()
}
