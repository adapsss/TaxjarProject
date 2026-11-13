// App state for every screen, backed by the real backend through the frozen api/client.ts.
// One provider owns all fetching and the app's only EventSource (plan Task A3): actions call the
// API, and the toast and the work question come from the live event stream, so a payment sent
// from the simulator tab (or curl) shows up here too.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { Account, Country, SimulateIncoming, TaxProfile, TaxSummary, Transaction } from '../api/client'
import { subscribe } from '../api/events'
import { buildSummary, type Summary } from '../lib/taxjar'
import { scenarios, toPayment } from './scenarios'

export type ScreenState = 'ready' | 'loading' | 'error'
/** 'live' shows the backend as it is; filled / empty / not-set-up reset it to that state; loading / error only fake a screen state. */
export type PresetChoice = 'live' | 'filled' | 'empty' | 'not-set-up' | 'loading' | 'error'

/** Tabs of this app tell each other when one of them is replaying setup payments. */
const DEMO_CHANNEL = 'taxjar-demo'

/** The profile the "Empty" and "Filled" demo states switch on. */
const DEMO_PROFILE: TaxProfile = { country: 'EE', regime: 'entrepreneur_account', rate: 2000, taxCurrency: 'EUR', enabled: true }
/** Income payments that fill the jar for the "Filled" state. */
const FILL_WITH = ['nordwind', 'pihlakas', 'brightside']

interface Data {
  profile: TaxProfile
  account: Account
  transactions: Transaction[]
}
const EMPTY: Data = {
  profile: { country: '', regime: '', rate: 0, taxCurrency: 'EUR', enabled: false },
  account: { owner: '', balances: [], jars: [] },
  transactions: [],
}

interface Toast {
  key: number
  txId: string
}

interface Store extends Data {
  summary: Summary
  countries: Country[]
  preset: PresetChoice
  screen: ScreenState
  toast: Toast | null
  question: string | null
  flash: { key: number; amount: number } | null
  /** Label of the request in flight, e.g. "undo:<id>"; buttons disable themselves on it. */
  busy: string | null
  failNext: boolean
  simulate: (payment: SimulateIncoming, label?: string) => Promise<Transaction>
  answer: (txId: string, isIncome: boolean) => Promise<void>
  undo: (txId: string) => Promise<void>
  pay: () => Promise<number>
  saveProfile: (p: TaxProfile) => Promise<void>
  setPreset: (p: PresetChoice) => Promise<void>
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
  const [data, setData] = useState<Data>(EMPTY)
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
  // Another tab (the simulator) is setting up a demo state: the payments it replays are setup, not news.
  // It says so over a BroadcastChannel, so a real payment sent right after a reset still gets its toast.
  const remoteQuiet = useRef(false)
  const channel = useRef<BroadcastChannel | null>(null)

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
    setData({ profile, account, transactions })
    setTaxSummary(summary)
  }, [])

  /** Fetch countries and everything else; resolves to the screen state to show. */
  const fetchAll = useCallback(async (): Promise<ScreenState> => {
    try {
      const [list] = await Promise.all([api.getCountries(), refresh()])
      setCountries(list)
      return 'ready'
    } catch {
      return 'error'
    }
  }, [refresh])

  const load = useCallback(async () => {
    setScreen('loading')
    setScreen(await fetchAll())
  }, [fetchAll])

  // First load: the screen already starts as 'loading'.
  useEffect(() => {
    let live = true
    void fetchAll().then((next) => live && setScreen(next))
    return () => {
      live = false
    }
  }, [fetchAll])

  /** Put an event's transaction on screen at once; the refresh that follows fills in balances and totals. */
  const upsert = useCallback((tx: Transaction) => {
    setData((d) => {
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
          if (quietRef.current || quietTx.current.has(e.transaction.id) || remoteQuiet.current) return
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

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(DEMO_CHANNEL)
    channel.current = ch
    let timer: ReturnType<typeof setTimeout> | undefined
    ch.onmessage = (m: MessageEvent<string>) => {
      clearTimeout(timer)
      if (m.data === 'setup-start') {
        remoteQuiet.current = true
        // If that tab is closed mid-setup, don't stay quiet forever.
        timer = setTimeout(() => (remoteQuiet.current = false), 8000)
      } else if (m.data === 'setup-end') {
        // The last setup event may still be on its way over the event stream.
        timer = setTimeout(() => (remoteQuiet.current = false), 400)
      }
    }
    return () => {
      clearTimeout(timer)
      ch.close()
      channel.current = null
    }
  }, [])

  /** Run an API action with a busy label and the "Next action fails" demo switch, then refresh. */
  const call = useCallback(
    async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
      setBusy(label)
      try {
        if (failRef.current) {
          setFailNext(false)
          await wait(450)
          throw new Error('Something went wrong on our side. Nothing moved, so it’s safe to try again.')
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
    (payment: SimulateIncoming, label = 'sim') => call(label, () => api.simulateIncoming(toPayment(payment))),
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
      channel.current?.postMessage('setup-start')
      setScreen('loading')
      try {
        await api.resetDemo()
        if (p !== 'not-set-up') await api.putTaxProfile(DEMO_PROFILE)
        if (p === 'filled') {
          for (const s of scenarios.filter((x) => FILL_WITH.includes(x.id))) {
            quietTx.current.add((await api.simulateIncoming(toPayment(s))).id)
          }
        }
        await refresh()
        setScreen('ready')
      } catch {
        setScreen('error')
      } finally {
        quietRef.current = false
        channel.current?.postMessage('setup-end')
      }
    },
    [load, refresh],
  )

  const retry = useCallback(() => {
    setPresetState('live')
    void load()
  }, [load])
  const dismissToast = useCallback(() => setToast(null), [])
  const closeQuestion = useCallback(() => setQuestion(null), [])
  const openQuestion = useCallback((id: string) => setQuestion(id), [])

  const value = useMemo<Store>(
    () => ({
      ...data,
      summary: buildSummary(data.profile, data.transactions, taxSummary),
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
      retry,
      dismissToast,
      closeQuestion,
      openQuestion,
      setFailNext,
    }),
    [data, taxSummary, countries, preset, screen, toast, question, flash, busy, failNext, simulate, answer, undo, pay, saveProfile, setPreset, retry, dismissToast, closeQuestion, openQuestion],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
