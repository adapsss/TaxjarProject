import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CheckIcon, Disclaimer, Flag } from '../components/ui'
import { useStore } from '../data/store'
import { formatMoney, formatRate } from '../lib/money'

const CURRENCIES = ['EUR', 'USD', 'GBP']
const FLAG_EMOJI: Record<string, string> = { EE: '🇪🇪', XX: '🌍', '*': '🌍' }

/** Remount when the demo state switches, so the wizard starts from the right step. */
export function Setup() {
  const { preset } = useStore()
  return <SetupFlow key={preset} />
}

function SetupFlow() {
  const { db, summary, countries, saveProfile, busy } = useStore()
  const nav = useNavigate()
  const editing = db.profile.enabled
  const [step, setStep] = useState(editing ? 3 : 1)
  const [country, setCountry] = useState(editing ? db.profile.country : '')
  const [regime, setRegime] = useState(editing ? db.profile.regime : '')
  const [rate, setRate] = useState(db.profile.rate)
  const [currency, setCurrency] = useState(db.profile.taxCurrency)
  const [error, setError] = useState<string | null>(null)

  const c = countries.find((x) => x.code === country)
  const r = c?.regimes.find((x) => x.id === regime)
  const lockedCurrency = editing && summary.held > 0 ? db.profile.taxCurrency : null

  const pickRegime = (id: string) => {
    setRegime(id)
    setRate(c!.regimes.find((x) => x.id === id)!.defaultRate)
  }
  const save = () => {
    setError(null)
    saveProfile({ country, regime, rate, taxCurrency: currency, enabled: true }).then(
      () => nav(editing ? '/tax-jar' : '/'),
      (e: Error) => setError(e.message),
    )
  }

  return (
    <div className="mx-auto max-w-[640px]">
      <Progress step={step} />

      {step === 1 && (
        <Step title="Where do you pay taxes?" sub="We’ll use the right rules and deadlines for your country.">
          <div role="radiogroup" className="space-y-2.5">
            {countries.map((x) => (
              <Choice key={x.code} checked={country === x.code} onClick={() => (setCountry(x.code), setRegime(''))} label={x.name}>
                <span className="text-[28px] leading-none">{FLAG_EMOJI[x.code] ?? '🏳️'}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{x.name}</span>
                  <span className="block text-sm text-muted">{x.regimes.map((g) => g.name).join(' · ')}</span>
                </span>
              </Choice>
            ))}
          </div>
          <Footer>
            <span />
            <Button size="lg" disabled={!country} onClick={() => setStep(2)}>Continue</Button>
          </Footer>
        </Step>
      )}

      {step === 2 && c && (
        <Step title="How are you registered?" sub={`Pick how you work in ${c.name}. You can change this later.`}>
          <div role="radiogroup" className="space-y-2.5">
            {c.regimes.map((g) => (
              <Choice key={g.id} checked={regime === g.id} onClick={() => pickRegime(g.id)} label={g.name}>
                <span className="flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{g.name}</span>
                    <span className="num rounded-full bg-canvas px-2.5 py-0.5 text-[13px] font-bold text-forest">{formatRate(g.defaultRate)}</span>
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{g.hint}</span>
                </span>
              </Choice>
            ))}
          </div>
          <Footer>
            <Button variant="ghost" size="lg" onClick={() => setStep(1)}>Back</Button>
            <Button size="lg" disabled={!regime} onClick={() => setStep(3)}>Continue</Button>
          </Footer>
        </Step>
      )}

      {step === 3 && (
        <Step
          title={editing ? 'Tax settings' : 'How much should we set aside?'}
          sub={r ? `${c!.name} · ${r.name}. We suggest ${formatRate(r.defaultRate)}, but it’s your call.` : undefined}
        >
          <Card className="p-6">
            <label htmlFor="rate" className="text-sm font-semibold text-muted">Share of each work payment</label>
            <div className="mt-3 flex items-center gap-3">
              <StepBtn label="Lower rate" onClick={() => setRate((v) => Math.max(0, v - 100))}>−</StepBtn>
              <div className="flex flex-1 items-baseline justify-center">
                <input
                  id="rate"
                  inputMode="numeric"
                  value={rate / 100}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d.]/g, ''))
                    if (!Number.isNaN(n)) setRate(Math.min(10_000, Math.round(n * 100)))
                  }}
                  className="num w-[150px] bg-transparent text-right text-[64px] leading-none font-extrabold text-forest outline-none"
                />
                <span className="text-[40px] font-extrabold text-forest">%</span>
              </div>
              <StepBtn label="Higher rate" onClick={() => setRate((v) => Math.min(10_000, v + 100))}>+</StepBtn>
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {[1500, 2000, 2500, 3000].map((v) => (
                <button
                  key={v}
                  onClick={() => setRate(v)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${rate === v ? 'bg-forest text-white' : 'bg-canvas text-ink hover:bg-lime-soft'}`}
                >
                  {formatRate(v)}
                </button>
              ))}
            </div>
            <p className="mt-5 rounded-2xl bg-lime-soft px-4 py-3 text-center text-[14.5px] text-forest">
              From a {formatMoney(100_000, currency)} client payment, we’ll keep{' '}
              <b className="num">{formatMoney(Math.round((100_000 * rate) / 10_000), currency)}</b> for taxes.
            </p>
          </Card>

          <p className="mt-7 mb-3 text-sm font-semibold text-muted">Keep the jar in</p>
          <div role="radiogroup" className="grid grid-cols-3 gap-2.5">
            {CURRENCIES.map((x) => {
              const disabled = !!lockedCurrency && x !== lockedCurrency
              return (
                <button
                  key={x}
                  role="radio"
                  aria-checked={currency === x}
                  disabled={disabled}
                  onClick={() => setCurrency(x)}
                  className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 bg-white py-3.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${currency === x ? 'border-forest' : 'border-line hover:border-forest/40'}`}
                >
                  <Flag currency={x} size={24} /> {x}
                </button>
              )
            })}
          </div>
          {lockedCurrency && <p className="mt-2 text-[13px] text-muted">Pay or empty the Tax Jar before changing its currency.</p>}
          {!lockedCurrency && <p className="mt-2 text-[13px] text-muted">Usually the currency you pay tax in. Payments in other currencies are converted when they arrive.</p>}

          {error && <p className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <Disclaimer className="mt-7" />
          <Footer>
            {editing ? <Button variant="ghost" size="lg" onClick={() => nav('/tax-jar')}>Cancel</Button> : <Button variant="ghost" size="lg" onClick={() => setStep(2)}>Back</Button>}
            <Button size="lg" loading={busy === 'profile'} onClick={save}>
              {editing ? 'Save changes' : 'Start setting money aside'}
            </Button>
          </Footer>
        </Step>
      )}
    </div>
  )
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <div className="flex gap-1.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-forest' : 'bg-black/[0.08]'}`} />
        ))}
      </div>
      <p className="mt-2.5 text-[13px] font-semibold text-muted">Step {step} of 3</p>
    </div>
  )
}

function Step({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="animate-rise">
      <h1 className="text-[34px] leading-tight font-extrabold tracking-tight text-forest">{title}</h1>
      {sub && <p className="mt-2 text-[16px] text-muted">{sub}</p>}
      <div className="mt-7">{children}</div>
    </section>
  )
}

function Choice({ checked, onClick, label, children }: { checked: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 text-left transition-colors ${checked ? 'border-forest' : 'border-line hover:border-forest/40'}`}
    >
      {children}
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-forest bg-forest text-lime' : 'border-black/20'}`}>
        {checked && <CheckIcon className="size-3.5" />}
      </span>
    </button>
  )
}

function StepBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} onClick={onClick} className="grid size-12 cursor-pointer place-items-center rounded-full bg-canvas text-2xl font-bold text-forest hover:bg-lime-soft">
      {children}
    </button>
  )
}

function Footer({ children }: { children: ReactNode }) {
  return <div className="mt-8 flex items-center justify-between">{children}</div>
}
