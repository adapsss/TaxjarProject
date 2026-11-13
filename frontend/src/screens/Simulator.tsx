import { useState, type FormEvent } from 'react'
import type { Transaction } from '../api/client'
import { Button, Card, JarIcon, Spinner } from '../components/ui'
import { exponent, formatMoney, symbol } from '../lib/money'
import { currencyChoices } from '../lib/taxjar'
import { useScenarios } from '../state/scenarios'
import { useStore, type PresetChoice } from '../state/store'

type Kind = 'company' | 'person' | 'unknown' | ''

interface Sent {
  key: number
  tx?: Transaction
  error?: string
  name: string
}

const outcome = (tx: Transaction, enabled: boolean) => {
  if (tx.reservation) return { text: `${formatMoney(tx.reservation.reservedAmount, tx.reservation.taxCurrency)} set aside`, cls: 'bg-lime-soft text-lime-ink' }
  if (tx.classification.label === 'unknown') return { text: enabled ? 'Asked: for work?' : 'Unclear (Tax Jar is off)', cls: 'bg-amber-soft text-amber-ink' }
  if (tx.classification.label === 'income') return { text: 'Income (Tax Jar is off)', cls: 'bg-black/[0.06] text-muted' }
  return { text: 'Personal, untouched', cls: 'bg-black/[0.06] text-muted' }
}

/**
 * /simulator — the stage tool that plays "money arrives". Open it in its own tab next to the app:
 * every payment goes through POST /api/simulate/incoming, and the app tab reacts over the event stream.
 */
export default function Simulator() {
  const { simulate, setPreset, busy, profile, screen } = useStore()
  const { scenarios, error: scenariosError } = useScenarios()
  const [sent, setSent] = useState<Sent[]>([])
  const [form, setForm] = useState({ senderName: '', senderKind: '' as Kind, amount: '', currency: 'EUR', reference: '' })
  const [resetting, setResetting] = useState<PresetChoice | null>(null)

  const send = (payment: Parameters<typeof simulate>[0], label: string) => {
    const key = Date.now()
    return simulate(payment, label).then(
      (tx) => setSent((s) => [{ key, tx, name: payment.senderName }, ...s].slice(0, 8)),
      (e: Error) => setSent((s) => [{ key, error: e.message, name: payment.senderName || 'Payment' }, ...s].slice(0, 8)),
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(
      {
        senderName: form.senderName,
        senderKind: form.senderKind || null,
        // Major units in the form, minor units on the wire (none for JPY, three for KWD).
        amount: Math.round(Number(form.amount) * 10 ** exponent(form.currency)),
        currency: form.currency,
        reference: form.reference,
      },
      'sim:custom',
    )
  }

  const reset = (p: PresetChoice) => {
    setResetting(p)
    setSent([])
    void setPreset(p).finally(() => setResetting(null))
  }

  const field = 'h-11 w-full rounded-xl border-2 border-line bg-white px-3.5 text-[15px] outline-none focus:border-forest'

  return (
    <div className="min-h-screen bg-[#161b13] px-4 py-8 text-white md:px-8 md:py-10">
      <div className="mx-auto max-w-[1040px]">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-lime uppercase">
              <JarIcon className="size-4" /> Demo tool · not part of the app
            </p>
            <h1 className="mt-2 text-[34px] font-extrabold tracking-tight">Payment simulator</h1>
            <p className="mt-1 text-[15px] text-white/60">
              Each button makes money arrive in the account. Keep the app open in another tab and watch it react.
            </p>
          </div>
          <div className="shrink-0 text-[13px] md:text-right">
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold ${screen === 'error' ? 'bg-danger text-white' : profile.enabled ? 'bg-lime text-forest' : 'bg-white/10 text-white/80'}`}>
              <span className="size-2 rounded-full bg-current" />
              {screen === 'error' ? 'Backend not reachable' : screen === 'loading' ? 'Connecting…' : profile.enabled ? 'Tax Jar is on' : 'Tax Jar is not set up'}
            </span>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <section>
            <h2 className="mb-3 text-[13px] font-bold tracking-[0.08em] text-white/50 uppercase">Demo payments</h2>
            <div className="space-y-2">
              {scenariosError && <p role="alert" className="text-sm text-white/70">Demo payments could not be loaded: {scenariosError}</p>}
              {scenarios.map((s, i) => (
                <button
                  key={s.id}
                  disabled={!!busy}
                  onClick={() => void send(s, `sim:${s.id}`)}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-2xl bg-white/[0.06] px-4 py-3 text-left transition-colors hover:bg-white/[0.11] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold ${i < 3 ? 'bg-lime text-forest' : 'bg-white/10 text-white/70'}`}>
                    {busy === `sim:${s.id}` ? <Spinner className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{s.label}</span>
                    <span className="block truncate text-[12.5px] text-white/50">
                      {s.senderName} · {s.reference || 'no reference'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[15px] font-bold">{formatMoney(s.amount, s.currency)}</span>
                    <span className="block text-[11.5px] text-white/45">expect: {s.expect === 'unknown' ? 'a question' : s.expect}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-white/45">1–3 are the golden path: a client invoice, a friend’s pizza money, an unclear payment.</p>
          </section>

          <div className="space-y-6">
            <Card className="p-6 text-ink">
              <h2 className="text-[17px] font-bold">Custom payment</h2>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <label className="block text-[13px] font-semibold text-muted">
                  Sender
                  <input required value={form.senderName} onChange={(e) => setForm({ ...form, senderName: e.target.value })} placeholder="Acme Inc." className={`mt-1 ${field}`} />
                </label>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <label className="block text-[13px] font-semibold text-muted">
                    Amount
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-muted">{symbol(form.currency)}</span>
                      <input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1500" className={`${field} pl-8`} />
                    </div>
                  </label>
                  <label className="block text-[13px] font-semibold text-muted">
                    Currency
                    <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`mt-1 ${field}`}>
                      {currencyChoices(null, profile.taxCurrency).concat(['JPY', 'PLN', 'SEK'].filter((c) => c !== profile.taxCurrency)).map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block text-[13px] font-semibold text-muted">
                  Reference
                  <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="INV-042" className={`mt-1 ${field}`} />
                </label>
                <label className="block text-[13px] font-semibold text-muted">
                  Sender type
                  <select value={form.senderKind} onChange={(e) => setForm({ ...form, senderKind: e.target.value as Kind })} className={`mt-1 ${field}`}>
                    <option value="">Not declared (let the engine decide)</option>
                    <option value="company">Company</option>
                    <option value="person">Person</option>
                  </select>
                </label>
                <Button type="submit" className="mt-1 w-full" loading={busy === 'sim:custom'} disabled={!!busy}>
                  Send payment
                </Button>
              </form>
            </Card>

            <section className="rounded-3xl bg-white/[0.06] p-5">
              <h2 className="text-[13px] font-bold tracking-[0.08em] text-white/50 uppercase">Reset the demo</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ['not-set-up', 'Fresh start', 'Before onboarding'],
                    ['empty', 'Set up', 'Empty Tax Jar'],
                    ['filled', 'Filled', 'Jar with history'],
                  ] as [PresetChoice, string, string][]
                ).map(([id, title, sub]) => (
                  <button
                    key={id}
                    disabled={resetting !== null || !!busy}
                    onClick={() => reset(id)}
                    className="cursor-pointer rounded-xl bg-white/[0.08] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.14] disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                      {resetting === id && <Spinner className="size-3" />}
                      {title}
                    </span>
                    <span className="block text-[11.5px] text-white/50">{sub}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-bold tracking-[0.08em] text-white/50 uppercase">What happened</h2>
          {sent.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/15 px-5 py-6 text-[14px] text-white/45">Nothing sent yet. Results show up here.</p>
          ) : (
            <ul className="space-y-1.5">
              {sent.map((s) => {
                const o = s.tx ? outcome(s.tx, profile.enabled) : null
                return (
                  <li key={s.key} className="flex items-center gap-4 rounded-xl bg-white/[0.05] px-4 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
                    {s.tx && <span className="num text-white/70">{formatMoney(s.tx.amount, s.tx.currency)}</span>}
                    {s.tx && <span className="hidden max-w-[320px] truncate text-[12.5px] text-white/45 lg:block">{s.tx.classification.reasons.join(' · ')}</span>}
                    {o ? (
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold ${o.cls}`}>{o.text}</span>
                    ) : (
                      <span role="alert" className="shrink-0 rounded-full bg-danger px-2.5 py-0.5 text-[12px] font-bold text-white">{s.error}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <p className="mt-10 text-center text-[11.5px] text-white/35">Hackathon prototype · not affiliated with Wise · synthetic data only</p>
      </div>
    </div>
  )
}
