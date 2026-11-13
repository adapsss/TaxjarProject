import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CheckIcon, Disclaimer, Flag } from '../components/ui'
import { useStore } from '../data/store'
import { formatMoney, formatRate } from '../lib/money'

const CURRENCIES = ['EUR', 'USD', 'GBP']
/** Listed first while the search box is empty: the demo account holder lives in Estonia. */
const SUGGESTED = ['EE']
const OTHER = '*'
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
  const [query, setQuery] = useState('')

  const other = countries.find((x) => x.code === OTHER)
  const searching = query.trim() !== ''
  // The chosen country stays in the list even when the search no longer matches it.
  const listed = countries
    .filter((x) => x.code !== OTHER && (x.code === country || matches(x, query)))
    .sort((a, b) => (searching ? 0 : rank(a.code) - rank(b.code)) || a.name.localeCompare(b.name))
  const pickCountry = (code: string) => (setCountry(code), setRegime(''))

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
          <label className="block">
            <span className="sr-only">Search countries</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={countries.length ? `Search ${countries.length - (other ? 1 : 0)} countries` : 'Search countries'}
              className="w-full rounded-2xl border-2 border-line bg-white px-5 py-3.5 text-[15px] font-medium outline-none placeholder:text-muted focus:border-forest"
            />
          </label>
          <div role="radiogroup" aria-label="Country">
          <div className="mt-3 max-h-[392px] space-y-2.5 overflow-y-auto pr-1">
            {listed.map((x) => (
              <Choice key={x.code} checked={country === x.code} onClick={() => pickCountry(x.code)} label={x.name}>
                <CountryMark code={x.code} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{x.name}</span>
                  <span className="block truncate text-sm text-muted">{x.regimes.map((g) => g.name).join(' · ')}</span>
                </span>
              </Choice>
            ))}
            {listed.length === 0 && (
              <p role="status" className="rounded-2xl bg-canvas px-5 py-6 text-center text-sm text-muted">
                {countries.length === 0
                  ? 'Loading countries…'
                  : `No country matches “${query}”.${other ? ' You can still set your own rate below.' : ''}`}
              </p>
            )}
          </div>
          {other && (
            <div className="mt-3 border-t border-line pt-3">
              <Choice checked={country === OTHER} onClick={() => pickCountry(OTHER)} label="Somewhere else">
                <CountryMark code={OTHER} />
                <span className="flex-1">
                  <span className="block font-semibold">Somewhere else</span>
                  <span className="block text-sm text-muted">Set your own rate. No country rules or deadlines.</span>
                </span>
              </Choice>
            </div>
          )}
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
                  {g.breakdownRule && <span className="mt-1 block text-[13px] font-semibold text-forest/80">{g.breakdownRule}</span>}
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

const rank = (code: string) => {
  const i = SUGGESTED.indexOf(code)
  return i === -1 ? SUGGESTED.length : i
}

/** Case- and accent-insensitive match on the country name or its code. */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
function matches(country: { code: string; name: string }, query: string): boolean {
  const q = fold(query.trim())
  return !q || fold(country.name).includes(q) || country.code.toLowerCase() === q
}

/** A flag where we have one, otherwise the country code as a plain badge. */
function CountryMark({ code }: { code: string }) {
  const flag = FLAG_EMOJI[code]
  if (flag) return <span className="w-10 text-center text-[28px] leading-none">{flag}</span>
  return <span className="grid h-7 w-10 shrink-0 place-items-center rounded-md bg-canvas text-[12px] font-bold tracking-wide text-forest">{code}</span>
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
