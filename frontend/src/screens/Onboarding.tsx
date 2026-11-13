import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { LoadError } from '../components/StateViews'
import { Button, Card, CheckIcon, Disclaimer, Flag, Skeleton } from '../components/ui'
import { formatMoney, formatRate } from '../lib/money'
import { flagEmoji, shortRegimeName, TAX_CURRENCIES } from '../lib/taxjar'
import { useStore } from '../state/store'

const OTHER = '*'

/** /onboarding — set up (or edit) the tax profile: country → regime → rate and tax currency. */
export default function Onboarding() {
  const { preset, screen } = useStore()
  return (
    <AppShell>
      <div className="mx-auto max-w-[640px]">
        {screen === 'loading' ? (
          <>
            <Skeleton className="h-2 w-full" />
            <Skeleton className="mt-10 h-10 w-80" />
            <Skeleton className="mt-8 h-[360px] rounded-3xl" />
          </>
        ) : screen === 'error' ? (
          <LoadError what="the tax settings" />
        ) : (
          // Remount when the demo state switches, so the wizard starts from the right step.
          <Flow key={preset} />
        )}
      </div>
    </AppShell>
  )
}

function Flow() {
  const { profile, summary, countries, saveProfile, busy } = useStore()
  const nav = useNavigate()
  const editing = profile.enabled
  const [step, setStep] = useState(editing ? 3 : 1)
  const [country, setCountry] = useState(editing ? profile.country : '')
  const [regime, setRegime] = useState(editing ? profile.regime : '')
  const [rate, setRate] = useState(profile.rate)
  const [currency, setCurrency] = useState(profile.taxCurrency)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const c = countries.find((x) => x.code === country)
  const r = c?.regimes.find((x) => x.id === regime)
  // The backend refuses a currency change while the jar holds money (409 tax_jar_not_empty).
  const lockedCurrency = editing && summary.held > 0 ? profile.taxCurrency : null

  const shown = useMemo(() => {
    const q = fold(query.trim())
    const named = countries.filter((x) => x.code !== OTHER)
    // The chosen country stays in the list even when the search no longer matches it.
    if (q) return named.filter((x) => x.code === country || fold(x.name).includes(q) || x.code.toLowerCase() === q)
    // No search yet: the profile's country first (the seed suggests one), then A–Z.
    return [...named].sort(
      (a, b) => Number(b.code === profile.country) - Number(a.code === profile.country) || a.name.localeCompare(b.name),
    )
  }, [countries, query, profile.country, country])
  const other = countries.find((x) => x.code === OTHER)

  const pickCountry = (code: string) => {
    setCountry(code)
    const only = countries.find((x) => x.code === code)?.regimes
    // A country with a single regime needs no second question.
    if (only?.length === 1) {
      setRegime(only[0].id)
      setRate(only[0].defaultRate)
    } else {
      setRegime('')
    }
  }
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
  const rateChips = [...new Set([1500, 2000, 2500, 3000, ...(r ? [r.defaultRate] : [])])].sort((a, b) => a - b)

  return (
    <>
      <Progress step={step} />

      {step === 1 && (
        <Step title="Where do you pay taxes?" sub="We’ll suggest a rate and the right deadlines for your country.">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="6.5" />
              <path d="m16 16 4 4" />
            </svg>
            <input
              autoFocus
              type="search"
              aria-label="Search countries"
              placeholder={`Search ${countries.length - 1} countries`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-13 w-full rounded-2xl border-2 border-line bg-white pr-4 pl-12 text-[16px] outline-none placeholder:text-muted/70 focus:border-forest"
            />
          </div>
          <div role="radiogroup" aria-label="Country" className="mt-3 max-h-[352px] space-y-2 overflow-y-auto rounded-2xl pr-1">
            {shown.map((x) => (
              <Choice key={x.code} checked={country === x.code} onClick={() => pickCountry(x.code)} label={x.name} compact>
                <span className="text-[24px] leading-none">{flagEmoji(x.code)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{x.name}</span>
                  <span className="block truncate text-[13px] text-muted">{x.regimes.map((g) => shortRegimeName(g.name)).join(' · ')}</span>
                </span>
              </Choice>
            ))}
            {shown.length === 0 && (
              <p role="status" className="rounded-2xl bg-canvas px-5 py-6 text-center text-[15px] text-muted">
                No country matches “{query.trim()}”. You can still set your own rate below.
              </p>
            )}
          </div>
          {other && (
            <div className="mt-3 border-t border-line pt-3">
              <Choice checked={country === OTHER} onClick={() => pickCountry(OTHER)} label="Somewhere else" compact>
                <span className="text-[24px] leading-none">{flagEmoji(OTHER)}</span>
                <span className="flex-1">
                  <span className="block font-semibold">Somewhere else</span>
                  <span className="block text-[13px] text-muted">Set your own rate. No country rules or deadlines.</span>
                </span>
              </Choice>
            </div>
          )}
          <Footer>
            {editing ? <Button variant="ghost" size="lg" onClick={() => nav('/tax-jar')}>Cancel</Button> : <span />}
            <Button size="lg" disabled={!c} onClick={() => setStep(c && c.regimes.length === 1 ? 3 : 2)}>Continue</Button>
          </Footer>
        </Step>
      )}

      {step === 2 && c && (
        <Step title="How are you registered?" sub={`Pick how you work in ${c.name}. You can change this later.`}>
          <div role="radiogroup" aria-label="Regime" className="space-y-2.5">
            {c.regimes.map((g) => (
              <Choice key={g.id} checked={regime === g.id} onClick={() => pickRegime(g.id)} label={shortRegimeName(g.name)}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{shortRegimeName(g.name)}</span>
                    <span className="num shrink-0 rounded-full bg-canvas px-2.5 py-0.5 text-[13px] font-bold text-forest">{formatRate(g.defaultRate)}</span>
                  </span>
                  {g.name !== shortRegimeName(g.name) && <span className="mt-0.5 block text-[13px] text-muted">{g.name}</span>}
                  <span className="mt-1.5 block text-[13.5px] leading-relaxed text-ink/75">{g.hint}</span>
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
          sub={c && r ? `${c.code === OTHER ? 'Somewhere else' : c.name} · ${shortRegimeName(r.name)}. We suggest ${formatRate(r.defaultRate)}, but it’s your call.` : undefined}
        >
          {editing && (
            <button onClick={() => setStep(1)} className="-mt-3 mb-5 block cursor-pointer text-sm font-semibold text-forest underline underline-offset-2">
              Change country or registration
            </button>
          )}
          <Card className="p-6">
            <label htmlFor="rate" className="text-sm font-semibold text-muted">Share of each work payment</label>
            <div className="mt-3 flex items-center gap-3">
              <StepBtn label="Lower rate" onClick={() => setRate((v) => Math.max(0, v - 100))}>−</StepBtn>
              <div className="flex flex-1 items-baseline justify-center">
                <input
                  id="rate"
                  inputMode="decimal"
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
              {rateChips.map((v) => (
                <button
                  key={v}
                  onClick={() => setRate(v)}
                  className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${rate === v ? 'bg-forest text-white' : 'bg-canvas text-ink hover:bg-lime-soft'}`}
                >
                  {formatRate(v)}
                  {r?.defaultRate === v && <span className="ml-1 font-medium opacity-70">suggested</span>}
                </button>
              ))}
            </div>
            <p className="mt-5 rounded-2xl bg-lime-soft px-4 py-3 text-center text-[14.5px] text-forest">
              {rate === 0 ? (
                'At 0% nothing is set aside.'
              ) : (
                <>
                  From a {formatMoney(100_000, currency)} client payment, we’ll keep{' '}
                  <b className="num">{formatMoney(Math.round((100_000 * rate) / 10_000), currency)}</b> for taxes.
                </>
              )}
            </p>
          </Card>

          <p className="mt-7 mb-3 text-sm font-semibold text-muted">Keep the jar in</p>
          <div role="radiogroup" aria-label="Tax currency" className="grid grid-cols-3 gap-2.5">
            {TAX_CURRENCIES.map((x) => (
              <button
                key={x}
                role="radio"
                aria-checked={currency === x}
                disabled={!!lockedCurrency && x !== lockedCurrency}
                onClick={() => setCurrency(x)}
                className={`flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 bg-white py-3.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${currency === x ? 'border-forest' : 'border-line hover:border-forest/40'}`}
              >
                <Flag currency={x} size={24} /> {x}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] text-muted">
            {lockedCurrency
              ? 'Pay the tax or undo what’s in the jar before changing its currency.'
              : 'Usually the currency you pay tax in. Payments in other currencies are converted when they arrive.'}
          </p>

          {error && <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <Disclaimer className="mt-7" />
          <Footer>
            {editing ? (
              <Button variant="ghost" size="lg" onClick={() => nav('/tax-jar')}>Cancel</Button>
            ) : (
              <Button variant="ghost" size="lg" onClick={() => setStep(c && c.regimes.length === 1 ? 1 : 2)}>Back</Button>
            )}
            <Button size="lg" loading={busy === 'profile'} disabled={!r} onClick={save}>
              {editing ? 'Save changes' : 'Start setting money aside'}
            </Button>
          </Footer>
        </Step>
      )}
    </>
  )
}

/** Case- and accent-insensitive text for matching: "Réunion" matches "reunion". */
const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

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

function Choice({ checked, onClick, label, compact, children }: { checked: boolean; onClick: () => void; label: string; compact?: boolean; children: ReactNode }) {
  return (
    <button
      role="radio"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-5 text-left transition-colors ${compact ? 'py-3' : 'py-4'} ${checked ? 'border-forest' : 'border-line hover:border-forest/40'}`}
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
