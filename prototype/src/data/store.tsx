import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import scenariosFx from '../../../fixtures/scenarios.json'
import * as engine from './engine'
import type { Scenario, TaxProfile } from './types'

export const scenarios = scenariosFx as Scenario[]

export type ScreenState = 'ready' | 'loading' | 'error'
export type PresetChoice = engine.Preset | 'loading' | 'error'

interface Toast {
  key: number
  txId: string
}

interface Store {
  db: engine.DB
  summary: engine.Summary
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

const LATENCY = 450
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState(() => engine.seed('filled'))
  const [preset, setPresetState] = useState<PresetChoice>('filled')
  const [screen, setScreen] = useState<ScreenState>('ready')
  const [toast, setToast] = useState<Toast | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [flash, setFlash] = useState<Store['flash']>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [failNext, setFailNext] = useState(false)
  const dbRef = useRef(db)
  dbRef.current = db
  const failRef = useRef(failNext)
  failRef.current = failNext
  const keyRef = useRef(0)

  /** Run a mutation like a network call: latency, optional injected failure, then commit a cloned DB. */
  const call = useCallback(async <T,>(label: string, fn: (d: engine.DB) => T): Promise<T> => {
    setBusy(label)
    try {
      await wait(LATENCY)
      if (failRef.current) {
        setFailNext(false)
        throw new Error('Something went wrong on our side. Nothing moved — try again.')
      }
      const next = structuredClone(dbRef.current)
      const result = fn(next)
      dbRef.current = next
      setDb(next)
      return result
    } finally {
      setBusy(null)
    }
  }, [])

  const showReserved = useCallback((txId: string, amount: number) => {
    keyRef.current += 1
    setToast({ key: keyRef.current, txId })
    setFlash({ key: keyRef.current, amount })
  }, [])

  const simulate = useCallback(
    async (id: string) => {
      const s = scenarios.find((x) => x.id === id)!
      const { tx, outcome } = await call(`sim:${id}`, (d) => engine.simulate(d, s))
      if (outcome === 'reserved') showReserved(tx.id, tx.reservation!.reservedAmount)
      if (outcome === 'asked') setQuestion(tx.id)
    },
    [call, showReserved],
  )

  const answer = useCallback(
    async (txId: string, isIncome: boolean) => {
      const tx = await call(`answer:${txId}:${isIncome}`, (d) => engine.answer(d, txId, isIncome))
      setQuestion(null)
      if (tx.reservation?.status === 'reserved' && isIncome) showReserved(tx.id, tx.reservation.reservedAmount)
    },
    [call, showReserved],
  )

  const undo = useCallback(
    async (txId: string) => {
      await call(`undo:${txId}`, (d) => engine.undo(d, txId))
      setToast((t) => (t?.txId === txId ? null : t))
    },
    [call],
  )

  const pay = useCallback(() => call('pay', (d) => engine.pay(d)), [call])

  const saveProfile = useCallback(
    async (p: TaxProfile) => {
      await call('profile', (d) => {
        d.profile = { ...p, enabled: true }
      })
    },
    [call],
  )

  const setPreset = useCallback((p: PresetChoice) => {
    setPresetState(p)
    setToast(null)
    setQuestion(null)
    setFlash(null)
    if (p === 'loading' || p === 'error') {
      setDb(engine.seed('filled'))
      setScreen(p)
    } else {
      setDb(engine.seed(p))
      setScreen('ready')
    }
  }, [])

  const value = useMemo<Store>(
    () => ({
      db,
      summary: engine.summary(db),
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
        setScreen('loading')
        setTimeout(() => {
          setScreen('ready')
          setPresetState('filled')
        }, 900)
      },
      dismissToast: () => setToast(null),
      closeQuestion: () => setQuestion(null),
      openQuestion: (id) => setQuestion(id),
      setFailNext,
    }),
    [db, preset, screen, toast, question, flash, busy, failNext, simulate, answer, undo, pay, saveProfile, setPreset],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore outside StoreProvider')
  return s
}
