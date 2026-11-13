import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeftIcon,
  Button,
  Card,
  CheckIcon,
  CircleButton,
  CloseIcon,
  Disclaimer,
  Flag,
  SearchIcon,
  ScreenTitle,
} from '../components/ui'
import { useStore } from '../state/store'
import { formatMoney, formatRate } from '../lib/money'

const CURRENCIES = ['EUR', 'USD', 'GBP']
/** Listed first while the search box is empty: the demo account holder lives in Estonia. */
const SUGGESTED = ['EE']
const OTHER = '*'

/** Remount when the demo state switches or the profile arrives, so the wizard starts from the right step. */
export default function Setup() {
  const { preset, profile } = useStore()
  return <SetupFlow key={`${preset}:${profile.enabled}`} />
}

function SetupFlow() {
  const { profile, summary, countries, saveProfile, busy } = useStore()
  const nav = useNavigate()
  const editing = profile.enabled
  const [step, setStep] = useState(editing ? 3 : 1)
  const [country, setCountry] = useState(editing ? profile.country : '')
  const [regime, setRegime] = useState(editing ? profile.regime : '')
  const [rate, setRate] = useState(profile.rate)
  const [currency, setCurrency] = useState(profile.taxCurrency)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const other = countries.find((x) => x.code === OTHER)
  const searching = query.trim() !== ''
  // The chosen country stays in the list even when the search no longer matches it.
  const listed = countries
    .filter((x) => x.code !== OTHER && (x.code === country || matches(x, query)))
    .sort((a, b) => (searching ? 0 : rank(a.code) - rank(b.code)) || a.name.localeCompare(b.name))
  const suggested = searching ? [] : listed.filter((x) => SUGGESTED.includes(x.code))
  const rest = listed.filter((x) => !suggested.includes(x))
  const pickCountry = (code: string) => (setCountry(code), setRegime(''))

  const c = countries.find((x) => x.code === country)
  const r = c?.regimes.find((x) => x.id === regime)
  const lockedCurrency = editing && summary.held > 0 ? profile.taxCurrency : null

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

  const back = () => {
    if (step > 1) setStep(step - 1)
    else nav(editing ? '/tax-jar' : '/')
  }

  return (
    <div className="flex min-h-full flex-col px-5 pt-2">
      <header className="flex items-center justify-between">
        <CircleButton label={step > 1 ? 'Back' : editing ? 'Back to Tax Jar' : 'Close setup'} size={40} onClick={back}>
          {step > 1 || editing ? <ArrowLeftIcon className="size-[18px]" /> : <CloseIcon className="size-[18px]" />}
        </CircleButton>
        {editing ? (
          <span className="flex items-center gap-1.5 rounded-full bg-lime-soft px-2.5 py-1 text-[11px] font-semibold text-lime-ink">
            <span className="size-1.5 rounded-full bg-lime-ink/60" /> Tax Jar on
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-muted">Step {step} of 3</span>
        )}
      </header>

      {!editing && (
        <div className="mt-4 flex gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-forest' : 'bg-black/[0.08]'}`} />
          ))}
        </div>
      )}

      {step === 1 && (
        <Step
          title="Where do you pay taxes?"
          sub="We’ll use the right rules and deadlines for your country."
          footer={
            <Button size="lg" className="w-full" disabled={!country} onClick={() => setStep(2)}>
              Continue
            </Button>
          }
        >
          <label className="relative mt-1 block">
            <span className="sr-only">Search countries</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={countries.length ? `Search ${countries.length - (other ? 1 : 0)} countries` : 'Search countries'}
              className="h-[46px] w-full rounded-full bg-soft pr-4 pl-11 text-[14px] font-medium text-ink outline-none placeholder:text-muted focus:bg-white focus:ring-2 focus:ring-forest/25"
            />
          </label>

          <div role="radiogroup" aria-label="Country" className="mt-3">
            {suggested.length > 0 && (
              <>
                <SectionLabel>Suggested</SectionLabel>
                <div className="mt-1">
                  {suggested.map((x) => (
                    <CountryChoice key={x.code} item={x} selected={country === x.code} onClick={() => pickCountry(x.code)} />
                  ))}
                </div>
              </>
            )}
            {rest.length > 0 && (
              <>
                <SectionLabel className="mt-4">{searching ? 'Countries' : 'All countries'}</SectionLabel>
                <div className="mt-1">
                  {rest.map((x) => (
                    <CountryChoice key={x.code} item={x} selected={country === x.code} onClick={() => pickCountry(x.code)} />
                  ))}
                </div>
              </>
            )}
            {listed.length === 0 && (
              <p role="status" className="mt-3 rounded-2xl bg-white px-5 py-8 text-center text-[13px] text-muted">
                {countries.length === 0
                  ? 'Loading countries…'
                  : `No country matches “${query}”.${other ? ' You can still set your own rate below.' : ''}`}
              </p>
            )}
            {other && (
              <div className="mt-3 border-t border-line pt-3">
                <CountryChoice
                  item={{ code: OTHER, name: 'Somewhere else', regimes: [] }}
                  subtitle="Set your own rate. No country rules or deadlines."
                  selected={country === OTHER}
                  onClick={() => pickCountry(OTHER)}
                />
              </div>
            )}
          </div>
        </Step>
      )}

      {step === 2 && c && (
        <Step
          title="How are you registered?"
          sub={`Pick how you work in ${c.name}. You can change this later.`}
          footer={
            <Button size="lg" className="w-full" disabled={!regime} onClick={() => setStep(3)}>
              Continue
            </Button>
          }
        >
          <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-3">
            <Flag code={c.code} size={34} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{c.name}</p>
              <p className="truncate text-[12px] text-muted">{c.regimes.length} ways to work</p>
            </div>
          </div>
          <div role="radiogroup" aria-label="Registration" className="overflow-hidden rounded-[22px] bg-white">
            {c.regimes.map((g, i) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={regime === g.id}
                aria-label={g.name}
                onClick={() => pickRegime(g.id)}
                className={`press flex w-full cursor-pointer items-start gap-3 px-4 py-4 text-left ${
                  i < c.regimes.length - 1 ? 'border-b border-line/70' : ''
                }`}
              >
                <span
                  className={`mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${
                    regime === g.id ? 'border-forest bg-forest text-lime' : 'border-black/15'
                  }`}
                >
                  {regime === g.id && <CheckIcon className="size-3" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-[14px] leading-snug font-semibold">{g.name}</span>
                    <span className="money shrink-0 rounded-full bg-lime-soft px-2 py-0.5 text-[11.5px] font-bold text-forest">
                      {formatRate(g.defaultRate)}
                    </span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-relaxed text-muted">{g.hint}</span>
                  {g.breakdownRule && <span className="mt-1 block text-[11.5px] font-semibold text-forest/70">{g.breakdownRule}</span>}
                </span>
              </button>
            ))}
          </div>
        </Step>
      )}

      {step === 3 && (
        <Step
          title={editing ? 'Tax settings' : 'How much should we set aside?'}
          sub={r ? `${c!.name} · ${r.name}. We suggest ${formatRate(r.defaultRate)}, but it’s your call.` : undefined}
          footer={
            <Button size="lg" className="w-full" loading={busy === 'profile'} onClick={save}>
              {editing ? 'Save changes' : 'Start setting money aside'}
            </Button>
          }
        >
          {c && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="press mb-4 flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left"
            >
              <Flag code={c.code} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{c.name}</span>
                <span className="block truncate text-[12px] text-muted">{r?.name ?? 'Choose registration'}</span>
              </span>
              <span className="text-[12px] font-semibold text-forest">Change</span>
            </button>
          )}

          <Card className="p-5">
            <label htmlFor="rate" className="text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">
              Share of each work payment
            </label>
            <div className="mt-3 flex items-center gap-3">
              <CircleButton label="Lower rate" size={40} onClick={() => setRate((v) => Math.max(0, v - 100))}>
                <span className="text-xl font-bold">−</span>
              </CircleButton>
              <div className="flex flex-1 items-baseline justify-center">
                <input
                  id="rate"
                  inputMode="numeric"
                  maxLength={5}
                  value={rate / 100}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d.]/g, ''))
                    if (!Number.isNaN(n)) setRate(Math.min(10_000, Math.max(0, Math.round(n * 100))))
                  }}
                  className="money w-[112px] bg-transparent text-right text-[54px] leading-none font-extrabold text-forest outline-none"
                />
                <span className="text-[34px] leading-none font-extrabold text-forest">%</span>
              </div>
              <CircleButton label="Higher rate" size={40} onClick={() => setRate((v) => Math.min(10_000, v + 100))}>
                <span className="text-xl font-bold">+</span>
              </CircleButton>
            </div>
            <div className="mt-3 flex justify-center gap-2">
              {[1500, 2000, 2500, 3000].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRate(v)}
                  className={`press cursor-pointer rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                    rate === v ? 'bg-forest text-white' : 'bg-soft text-ink hover:bg-lime-soft'
                  }`}
                >
                  {formatRate(v)}
                </button>
              ))}
            </div>
            <p className="mt-4 rounded-2xl bg-lime-soft px-4 py-3 text-center text-[13px] leading-relaxed text-forest">
              From a {formatMoney(100_000, currency)} client payment, we’ll keep{' '}
              <b className="money">{formatMoney(Math.round((100_000 * rate) / 10_000), currency)}</b> for taxes.
            </p>
          </Card>

          <p className="mt-5 mb-2 text-[12px] font-semibold tracking-[0.06em] text-muted uppercase">Keep the jar in</p>
          <div role="radiogroup" aria-label="Tax currency" className="grid grid-cols-3 gap-2">
            {CURRENCIES.map((x) => {
              const disabled = !!lockedCurrency && x !== lockedCurrency
              return (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={currency === x}
                  disabled={disabled}
                  onClick={() => setCurrency(x)}
                  className={`press flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 bg-white py-3 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-35 ${
                    currency === x ? 'border-forest' : 'border-transparent hover:border-forest/20'
                  }`}
                >
                  <Flag code={x} size={24} /> {x}
                </button>
              )
            })}
          </div>
          {lockedCurrency && <p className="mt-2 text-[12px] text-muted">Pay or empty the Tax Jar before changing its currency.</p>}
          {!lockedCurrency && (
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Usually the currency you pay tax in. Payments in other currencies are converted when they arrive.
            </p>
          )}

          {error && <p role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-[13px] text-danger">{error}</p>}
          <Disclaimer className="mt-5 px-1" />
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

function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`px-1 text-[12px] font-medium text-muted ${className}`}>{children}</p>
}

function CountryChoice({
  item,
  subtitle,
  selected,
  onClick,
}: {
  item: { code: string; name: string; regimes: { name: string }[] }
  subtitle?: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={item.name}
      onClick={onClick}
      className="press flex w-full cursor-pointer items-center gap-3.5 rounded-2xl px-1 py-2.5 text-left hover:bg-white/70"
    >
      <Flag code={item.code} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{item.name}</span>
        <span className="block truncate text-[12px] text-muted">
          {subtitle ?? (item.regimes.length ? item.regimes.map((g) => g.name).join(' · ') : 'Country')}
        </span>
      </span>
      <span
        className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${
          selected ? 'border-forest bg-forest text-lime' : 'border-black/15'
        }`}
        aria-hidden="true"
      >
        {selected && <CheckIcon className="size-3" />}
      </span>
    </button>
  )
}

function Step({ title, sub, children, footer }: { title: string; sub?: string; children: ReactNode; footer: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col animate-rise">
      <div className="pt-5">
        <ScreenTitle>{title}</ScreenTitle>
        {sub && <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{sub}</p>}
      </div>
      <div className="mt-4 flex-1">{children}</div>
      <div className="sticky-footer mt-auto">{footer}</div>
    </section>
  )
}
