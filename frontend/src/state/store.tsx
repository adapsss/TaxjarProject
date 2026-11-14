// App state for every screen, backed by the real backend through the frozen api/client.ts.
// One provider owns all fetching and the app's only EventSource (plan Task A3): actions call the
// API, and the toast and the work question come from the live event stream, so a payment sent
// from the simulator tab (or curl) shows up here too.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../api/client'
import type { Account, CatchUp, Country, SimulateIncoming, TaxProfile, TaxSummary, Transaction } from '../api/client'
import { subscribe } from '../api/events'
import { formatMoney } from '../lib/money'
import { buildSummary, type Summary } from '../lib/taxjar'
import { loadScenarios, toPayment } from './scenarios'

export type ScreenState = 'ready' | 'loading' | 'error'
/** 'live' shows the backend as it is; filled / empty / not-set-up reset it to that state; loading / error only fake a screen state. */
export type PresetChoice = 'live' | 'filled' | 'empty' | 'not-set-up' | 'loading' | 'error'

/** Tabs of this app tell each other when one of them is replaying setup payments. */
const DEMO_CHANNEL = 'taxjar-demo'
/** What a tab setting up a demo state tells the other tabs; `ids` are the payments it sent as setup. */
type SetupMessage = { type: 'setup-start' } | { type: 'setup-end'; ids: string[] }

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
  /** Earlier client income with no tax set aside (it predates the Tax Jar); null while none. */
  catchUpOffer: CatchUp | null
  /** False while the live event stream is down; the browser keeps reconnecting by itself. */
  connected: boolean
  /** A one-off message toast, e.g. after catching up. */
  notice: { key: number; title: string; detail: string } | null
  catchUp: () => Promise<void>
  dismissCatchUp: () => void
  dismissNotice: () => void
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

/** How often a refresh triggered by a live event is retried after it failed. */
const EVENT_REFRESH_RETRIES = 3
/** After this long without an answer, an event refresh counts as failed. */
const EVENT_REFRESH_TIMEOUT_MS = 15000

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
  const [catchUpOffer, setCatchUpOffer] = useState<CatchUp | null>(null)
  const [catchUpDismissed, setCatchUpDismissed] = useState(false)
  const [notice, setNotice] = useState<Store['notice']>(null)
  const [connected, setConnected] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [failNext, setFailNext] = useState(false)
  const failRef = useRef(false)
  const keyRef = useRef(0)
  const refreshSeq = useRef(0)
  const appliedSeq = useRef(0)
  // Refreshes numbered up to this started before the newest live event, so they cannot know about it.
  const staleUpTo = useRef(0)
  // Refreshes asked for by live events: at most one runs and one waits, however many events arrive.
  const eventRefresh = useRef({ running: false, again: false })
  const mounted = useRef(true)
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

  /**
   * Re-read everything the screens show. Of overlapping refreshes a result is applied only if it is
   * newer than what is on screen and started after the newest live event: a late answer never
   * overwrites a fresher one, and a newer refresh that failed does not throw away an older one that worked.
   */
  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current
    const [profile, account, transactions, summary, offer] = await Promise.all([
      api.getTaxProfile(),
      api.getAccount(),
      api.getTransactions(),
      api.getTaxSummary(),
      api.getCatchUp(),
    ])
    if (seq < appliedSeq.current || seq <= staleUpTo.current) return
    appliedSeq.current = seq
    setData({ profile, account, transactions })
    setTaxSummary(summary)
    setCatchUpOffer(offer.count > 0 ? offer : null)
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * Refresh because a live event said something changed. Events come in bursts (a catch-up sends one
   * per payment), so while one refresh runs, any number of further events add up to a single refresh
   * after it. A refresh that fails is tried again a few times, so the screen does not stay stale.
   */
  const refreshSoon = useCallback(() => {
    const state = eventRefresh.current
    // A refresh already on its way read the backend before this event: applying it would take the
    // event's payment off the screen again until the next refresh. Drop it; a fresh one follows.
    staleUpTo.current = refreshSeq.current
    if (state.running) {
      state.again = true
      return
    }
    state.running = true
    const run = (attempt: number) => {
      state.again = false
      // A request that never answers must not stop live refreshes for good.
      const gaveUp = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('refresh timed out')), EVENT_REFRESH_TIMEOUT_MS))
      void Promise.race([refresh(), gaveUp]).then(
        () => true,
        () => false,
      ).then((ok) => {
        if (!mounted.current) {
          state.running = false
        } else if (state.again) {
          run(0)
        } else if (!ok && attempt < EVENT_REFRESH_RETRIES) {
          setTimeout(() => (mounted.current ? run(attempt + 1) : (state.running = false)), 1000 * (attempt + 1))
        } else {
          state.running = false
        }
      })
    }
    run(0)
  }, [refresh])

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
    // The state is set when the fetch resolves, not synchronously in the effect.
    // eslint-disable-next-line react/set-state-in-effect
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
            setCatchUpDismissed(false)
            setNotice(null)
            setToast(null)
            setQuestion(null)
            setFlash(null)
            refreshSoon()
            return
          }
          if (e.type === 'resync') {
            refreshSoon() // the server dropped events for this tab: read everything again
            return
          }
          upsert(e.transaction)
          refreshSoon()
          if (quietRef.current || quietTx.current.has(e.transaction.id) || remoteQuiet.current) return
          if (e.type === 'reservation.created' && e.transaction.reservation) {
            showReserved(e.transaction.id, e.transaction.reservation.reservedAmount)
          } else if (e.type === 'question.asked') {
            setQuestion(e.transaction.id)
          } else if (e.type === 'reservation.undone') {
            setToast((t) => (t?.txId === e.transaction.id ? null : t))
          }
        },
        () => {
          setConnected(true)
          refreshSoon() // catch up on anything missed while disconnected
        },
        () => setConnected(false),
      ),
    [refreshSoon, upsert, showReserved],
  )

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(DEMO_CHANNEL)
    channel.current = ch
    let timer: ReturnType<typeof setTimeout> | undefined
    ch.onmessage = (m: MessageEvent<SetupMessage>) => {
      clearTimeout(timer)
      if (m.data.type === 'setup-start') {
        remoteQuiet.current = true
        // If that tab is closed mid-setup, don't stay quiet forever.
        timer = setTimeout(() => (remoteQuiet.current = false), 8000)
      } else if (m.data.type === 'setup-end') {
        // Setup events still on their way over the event stream are known by id, so stop
        // being quiet at once: a real payment sent right after the reset gets its toast.
        for (const id of m.data.ids) quietTx.current.add(id)
        remoteQuiet.current = false
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

  const catchUp = useCallback(async () => {
    // One summary toast instead of one per payment.
    quietRef.current = true
    try {
      const done = await call('catch-up', api.catchUp)
      keyRef.current += 1
      setFlash({ key: keyRef.current, amount: done.reserved })
      setNotice({
        key: keyRef.current,
        title: `${formatMoney(done.reserved, done.taxCurrency)} set aside for earlier income`,
        detail: `${done.count} client payment${done.count === 1 ? '' : 's'} from before your Tax Jar, now covered.`,
      })
    } finally {
      // The last reservation events may still be on their way over the stream.
      setTimeout(() => (quietRef.current = false), 600)
    }
  }, [call])

  const saveProfile = useCallback(
    async (p: TaxProfile) => {
      await call('profile', () => api.putTaxProfile({ ...p, enabled: true }))
      // The demo was reset to "Not set up" or "Empty"; once set up, it is live again.
      setPresetState('live')
    },
    [call],
  )

  const setPreset = useCallback(
    async (p: PresetChoice) => {
      setPresetState(p)
      setToast(null)
      setQuestion(null)
      setFlash(null)
      setNotice(null)
      setCatchUpDismissed(false)
      if (p === 'loading' || p === 'error') {
        setScreen(p)
        return
      }
      if (p === 'live') {
        await load()
        return
      }
      quietRef.current = true
      const setupIds: string[] = []
      channel.current?.postMessage({ type: 'setup-start' } satisfies SetupMessage)
      setScreen('loading')
      try {
        await api.resetDemo()
        if (p !== 'not-set-up') await api.putTaxProfile(DEMO_PROFILE)
        if (p === 'filled') {
          const scenarios = await loadScenarios()
          for (const s of scenarios.filter((x) => FILL_WITH.includes(x.id))) {
            const id = (await api.simulateIncoming(toPayment(s))).id
            quietTx.current.add(id)
            setupIds.push(id)
          }
        }
        await refresh()
        setScreen('ready')
      } catch {
        setScreen('error')
      } finally {
        quietRef.current = false
        channel.current?.postMessage({ type: 'setup-end', ids: setupIds } satisfies SetupMessage)
      }
    },
    [load, refresh],
  )

  const retry = useCallback(() => {
    setPresetState('live')
    void load()
  }, [load])
  const dismissToast = useCallback(() => setToast(null), [])
  const dismissNotice = useCallback(() => setNotice(null), [])
  const dismissCatchUp = useCallback(() => setCatchUpDismissed(true), [])
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
      catchUpOffer: catchUpDismissed ? null : catchUpOffer,
      notice,
      connected,
      catchUp,
      dismissCatchUp,
      dismissNotice,
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
    [data, taxSummary, countries, preset, screen, toast, question, flash, busy, failNext, simulate, answer, undo, pay, saveProfile, setPreset, retry, dismissToast, closeQuestion, openQuestion, catchUpOffer, catchUpDismissed, notice, connected, catchUp, dismissCatchUp, dismissNotice],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
