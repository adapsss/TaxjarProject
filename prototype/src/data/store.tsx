// App state, backed by the real backend (FastAPI on :8000, proxied as /api).
// Actions call the API; the toast and the work question come from the live
// event stream, so payments sent from another tab or by curl show up too.
// engine.ts is still used for the read models (tags, monthly bars) over this data.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import demoScenariosFx from '../../../demo/scenarios.json'
import scenariosFx from '../../../fixtures/scenarios.json'
import * as api from './api'
import * as engine from './engine'
import { subscribe } from './events'
import type { Country, Scenario, SimulateIncoming, TaxProfile, TaxSummary, Transaction } from './types'

export const scenarios = scenariosFx as Scenario[]

export type ScreenState = 'ready' | 'loading' | 'error'
/** 'live' shows the backend as it is; filled / empty / not-set-up reset it to that state; loading / error fake a screen state. */
export type PresetChoice = 'live' | engine.Preset | 'loading' | 'error'

/** The profile the "Empty" and "Filled" demo states switch on. */
const DEMO_PROFILE: TaxProfile = { country: 'EE', regime: 'entrepreneur_account', rate: 2000, taxCurrency: 'EUR', enabled: true }
/** Income payments from demo/scenarios.json that fill the jar for the "Filled" state. */
const FILL_WITH = ['nordwind', 'pihlakas', 'brightside']
const fillPayments = (demoScenariosFx as unknown as (SimulateIncoming & { id: string })[]).filter((s) => FILL_WITH.includes(s.id))

const toPayment = (s: SimulateIncoming): SimulateIncoming => ({
  senderName: s.senderName,
  senderKind: s.senderKind ?? null,
  amount: s.amount,
  currency: s.currency,
  reference: s.reference ?? '',
})

let countriesCache: Country[] = []
/** Countries as last loaded from the backend, for plain helpers outside React. */
export const liveCountries = () => countriesCache

const EMPTY_DB: engine.DB = {
  profile: { country: '', regime: '', rate: 0, taxCurrency: 'EUR', enabled: false },
  account: { owner: '', balances: [], jars: [] },
  transactions: [],
  payers: {},
}

/** Read model for the screens: bars, lists and tags from the transactions; totals and deadline from the backend. */
function toSummary(db: engine.DB, server: TaxSummary | null): engine.Summary {
  const local = engine.summary(db)
  if (!server) return local
  return {
    ...local,
    currency: server.taxCurrency,
    held: server.totalReserved,
    paid: server.totalPaid,
    estimatedDue: server.estimatedDue,
    // "2026-12-10" as a local date, so it never shifts a day across time zones.
    nextDeadline: server.nextDeadline ? new Date(`${server.nextDeadline}T00:00:00`) : null,
  }
}

interface Toast {
  key: number
  txId: string
}

interface Store {
  db: engine.DB
  summary: engine.Summary
  countries: Country[]
  preset: PresetChoice
  screen: ScreenState
  toast: Toast | null
  question: string | null
  flash: { key: number; amount: number } | null
  busy: string | null
  failNext: boolean
  simulate: (scenarioId: string) => Promise<void>
  answer: (txId: string, isIncome: boolean) => Promise<void>
  undo: (txId: string) => Promise<void>
  pay: () => Promise<number>
  saveProfile: (p: TaxProfile) => Promise<void>
  setPreset: (p: PresetChoice) => void
  retry: () => void
  dismissToast: () => void
  closeQuestion: () => void
  openQuestion: (txId: string) => void
  setFailNext: (v: boolean) => void
}

const Ctx = createContext<Store | null>(null)

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ignore = () => {}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<engine.DB>(EMPTY_DB)
  const [taxSummary, setTaxSummary] = useState<TaxSummary | null>(null)
  const [countries, setCountries] = useState<Country[]>([])
  const [preset, setPresetState] = useState<PresetChoice>('live')
  const [screen, setScreen] = useState<ScreenState>('loading')
  const [toast, setToast] = useState<Toast | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [flash, setFlash] = useState<Store['flash']>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failNext, setFailNext] = useState(false)
  const failRef = useRef(false)
  const keyRef = useRef(0)
  const refreshSeq = useRef(0)
  // While the demo controls set up a state, its payments must not pop toasts or questions.
  const quietRef = useRef(false)
  const quietTx = useRef(new Set<string>())

  useEffect(() => {
    failRef.current = failNext
  }, [failNext])

  /** Re-read everything the screens show. Only the newest of overlapping refreshes is applied. */
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    const [profile, account, transactions, summary] = await Promise.all([
      api.getTaxProfile(),
      api.getAccount(),
      api.getTransactions(),
      api.getTaxSummary(),
    ])
    if (seq !== refreshSeq.current) return
    setDb({ profile, account, transactions, payers: {} })
    setTaxSummary(summary)
  }, [])

  const load = useCallback(async () => {
    setScreen('loading')
    try {
      const [list] = await Promise.all([api.getCountries(), refresh()])
      countriesCache = list
      setCountries(list)
      setScreen('ready')
    } catch {
      setScreen('error')
    }
  }, [refresh])

  useEffect(() => {
    void load()
  }, [load])

  /** Put an event's transaction on screen at once; the refresh that follows fills in balances and totals. */
  const upsert = useCallback((tx: Transaction) => {
    setDb((d) => {
      const known = d.transactions.some((t) => t.id === tx.id)
      return { ...d, transactions: known ? d.transactions.map((t) => (t.id === tx.id ? tx : t)) : [tx, ...d.transactions] }
    })
  }, [])

  const showReserved = useCallback((txId: string, amount: number) => {
    keyRef.current += 1
    setToast({ key: keyRef.current, txId })
    setFlash({ key: keyRef.current, amount })
  }, [])

  useEffect(
    () =>
      subscribe(
        (e) => {
          if (e.type === 'demo.reset') {
            setToast(null)
            setQuestion(null)
            setFlash(null)
            refresh().catch(ignore)
            return
          }
          upsert(e.transaction)
          refresh().catch(ignore)
          if (quietRef.current || quietTx.current.has(e.transaction.id)) return
          if (e.type === 'reservation.created' && e.transaction.reservation) {
            showReserved(e.transaction.id, e.transaction.reservation.reservedAmount)
          } else if (e.type === 'question.asked') {
            setQuestion(e.transaction.id)
          } else if (e.type === 'reservation.undone') {
            setToast((t) => (t?.txId === e.transaction.id ? null : t))
          }
        },
        () => refresh().catch(ignore), // catch up on anything missed while disconnected
      ),
    [refresh, upsert, showReserved],
  )

  /** Run an API action with a busy label and the "Next action fails" demo switch, then refresh. */
  const call = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      setBusy(label)
      try {
        if (failRef.current) {
          setFailNext(false)
          await wait(450)
          throw new Error('Something went wrong on our side. Nothing moved — try again.')
        }
        const result = await fn()
        await refresh().catch(ignore)
        return result
      } finally {
        setBusy(null)
      }
    },
    [refresh],
  )

  const simulate = useCallback(
    async (id: string) => {
      const s = scenarios.find((x) => x.id === id)!
      await call(`sim:${id}`, () => api.simulateIncoming(toPayment(s)))
    },
    [call],
  )

  const answer = useCallback(
    async (txId: string, isIncome: boolean) => {
      await call(`answer:${txId}:${isIncome}`, () => api.answerTransaction(txId, isIncome))
      setQuestion(null)
    },
    [call],
  )

  const undo = useCallback(
    async (txId: string) => {
      await call(`undo:${txId}`, () => api.undoTransaction(txId))
      setToast((t) => (t?.txId === txId ? null : t))
    },
    [call],
  )

  const pay = useCallback(async () => (await call('pay', api.payTax)).paidAmount, [call])

  const saveProfile = useCallback(
    async (p: TaxProfile) => {
      await call('profile', () => api.putTaxProfile({ ...p, enabled: true }))
    },
    [call],
  )

  const setPreset = useCallback(
    async (p: PresetChoice) => {
      setPresetState(p)
      setToast(null)
      setQuestion(null)
      setFlash(null)
      if (p === 'loading' || p === 'error') {
        setScreen(p)
        return
      }
      if (p === 'live') {
        await load()
        return
      }
      quietRef.current = true
      setScreen('loading')
      try {
        await api.resetDemo()
        if (p !== 'not-set-up') await api.putTaxProfile(DEMO_PROFILE)
        if (p === 'filled') {
          for (const s of fillPayments) quietTx.current.add((await api.simulateIncoming(toPayment(s))).id)
        }
        await refresh()
        setScreen('ready')
      } catch {
        setScreen('error')
      } finally {
        quietRef.current = false
      }
    },
    [load, refresh],
  )

  const value = useMemo<Store>(
    () => ({
      db,
      summary: toSummary(db, taxSummary),
      countries,
      preset,
      screen,
      toast,
      question,
      flash,
      busy,
      failNext,
      simulate,
      answer,
      undo,
      pay,
      saveProfile,
      setPreset,
      retry: () => {
        setPresetState('live')
        void load()
      },
      dismissToast: () => setToast(null),
      closeQuestion: () => setQuestion(null),
      openQuestion: (id) => setQuestion(id),
      setFailNext,
    }),
    [db, taxSummary, countries, preset, screen, toast, question, flash, busy, failNext, simulate, answer, undo, pay, saveProfile, setPreset, load],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
