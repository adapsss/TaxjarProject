import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react'
import { useFocusTrap } from '../lib/useFocusTrap'
import { DISCLAIMER } from '../lib/taxjar'
import type { Tag as TagName } from '../lib/why'
import type { Counterparty } from '../api/client'

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger' | 'soft'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lime text-forest hover:bg-lime-2 active:bg-[#8fdd60]',
  // Wise's pills: lime for the one main action, a tint of green for the next, graphite for the rest.
  secondary: 'bg-lime-soft text-accent hover:bg-soft',
  ghost: 'text-accent hover:bg-soft',
  dark: 'bg-forest text-white hover:bg-forest-2',
  danger: 'bg-surface text-danger hover:bg-danger-soft',
  soft: 'bg-lime-soft text-accent hover:bg-soft',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  // Even the small button is 44pt tall: Apple's minimum for anything you tap.
  const sizes = { sm: 'h-11 px-4 text-[14px]', md: 'h-12 px-5 text-[16px]', lg: 'h-[54px] px-6 text-[17px]' }
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      className={`press inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />
}

export function CircleButton({
  label,
  children,
  className = '',
  variant = 'soft',
  size = 44,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  variant?: 'soft' | 'white' | 'lime' | 'dark'
  size?: number
}) {
  const styles = {
    soft: 'bg-soft text-ink hover:bg-line',
    white: 'bg-surface text-ink hover:bg-soft',
    lime: 'bg-lime text-forest hover:bg-lime-2',
    dark: 'bg-forest text-white hover:bg-forest-2',
  }
  return (
    <button
      {...rest}
      type="button"
      aria-label={label}
      title={label}
      // Never smaller than 44pt, whatever size was asked for.
      style={{ width: Math.max(size, 44), height: Math.max(size, 44) }}
      className={`press grid shrink-0 cursor-pointer place-items-center rounded-full ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

const TAG_STYLE: Record<Exclude<TagName, null>, string> = {
  'Tax set aside': 'bg-lime-soft text-lime-ink',
  Income: 'bg-sky/25 text-ink',
  'Tax paid': 'bg-forest text-white',
  Personal: 'bg-soft text-muted',
  'Needs your answer': 'bg-amber-soft text-amber-ink',
}

export function Tag({ name, children }: { name: Exclude<TagName, null>; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold ${TAG_STYLE[name]}`}>
      {name === 'Needs your answer' && <span className="size-1.5 rounded-full bg-amber" />}
      {children ?? name}
    </span>
  )
}

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

export function Avatar({ who, size = 46 }: { who: Counterparty; size?: number }) {
  const company = who.kind === 'company'
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`grid shrink-0 place-items-center font-bold ${
        company ? 'rounded-[15px] bg-forest text-lime' : 'rounded-full bg-soft text-ink'
      }`}
    >
      {initials(who.name)}
    </span>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-[28px] bg-surface ${className}`}>{children}</div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-ink/[0.07] ${className}`} />
}

export function Disclaimer({ dark, className = '' }: { dark?: boolean; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-[13px] leading-snug ${dark ? 'text-white/55' : 'text-muted'} ${className}`}>
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      {DISCLAIMER}
    </p>
  )
}

// A currency's flag is its country's: the first two letters of the ISO code, with a few exceptions.
const CURRENCY_FLAG: Record<string, string> = { EUR: 'eu', XCG: 'cw' }

/** A real, bundled SVG flag inside a perfect circle — Wise style. */
export function Flag({ code, size = 40, className = '' }: { code: string; size?: number; className?: string }) {
  const upper = code.toUpperCase()
  const value = (CURRENCY_FLAG[upper] ?? (upper.length === 3 ? upper.slice(0, 2) : upper)).toLowerCase()
  const iso = /^[a-z]{2}$/.test(value) ? value : null
  if (!iso) {
    return (
      <span style={{ width: size, height: size }} className={`flag-circle text-accent ${className}`} aria-hidden="true">
        <GlobeIcon style={{ width: size * 0.55, height: size * 0.55 }} />
      </span>
    )
  }
  return (
    <span style={{ width: size, height: size }} className={`flag-circle ${className}`} aria-hidden="true">
      <span className={`fi fi-${iso} fis`} />
    </span>
  )
}

export function ScreenTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`text-[36px] leading-[1.04] font-bold tracking-[-0.04em] text-ink ${className}`}>{children}</h1>
}

export function Sheet({
  label,
  onClose,
  children,
  className = '',
}: {
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Modal: focus moves in, Tab stays in, and focus returns to what opened it.
  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(panel)

  return (
    <div className="sheet" onMouseDown={onClose}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`sheet-panel outline-none ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sheet-grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="ios-switch cursor-pointer"
      data-on={checked}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`press min-h-11 cursor-pointer rounded-full px-4 py-2 text-[15px] font-semibold whitespace-nowrap ${
            value === o.id ? 'bg-lime text-forest' : 'bg-surface text-ink hover:bg-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function JarIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 3.5h8M9 3.5v2.3C6.9 6.8 5.8 8.5 5.8 11v6.2c0 1.8 1.4 3.3 3.2 3.3h6c1.8 0 3.2-1.5 3.2-3.3V11c0-2.5-1.1-4.2-3.2-5.2V3.5" />
      <path d="M5.9 13h12.2" />
    </svg>
  )
}

export function InfoIcon({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} style={style}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.2v3.8M8 5.1v.1" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function ArrowLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  )
}

export function ChevronRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

export function CloseIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  )
}

export function HomeIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 11.4 12 4.5l8 6.9v7.1a1.5 1.5 0 0 1-1.5 1.5H15v-5.4H9V20H5.5A1.5 1.5 0 0 1 4 18.5z" />
    </svg>
  )
}

export function ActivityIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M8 7h12M8 12h12M8 17h12" />
      <circle cx="4" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SettingsIcon({ className = '' }: { className?: string }) {
  // One solid gear: the hole is cut out of the same shape, so it reads as a single glyph.
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" className={className}>
      <path fillRule="evenodd" d="M10.23 4.92 L10.50 2.52 L13.50 2.52 L13.77 4.92 A7.3 7.3 0 0 1 15.76 5.74 L17.64 4.23 L19.77 6.36 L18.26 8.24 A7.3 7.3 0 0 1 19.08 10.23 L21.48 10.50 L21.48 13.50 L19.08 13.77 A7.3 7.3 0 0 1 18.26 15.76 L19.77 17.64 L17.64 19.77 L15.76 18.26 A7.3 7.3 0 0 1 13.77 19.08 L13.50 21.48 L10.50 21.48 L10.23 19.08 A7.3 7.3 0 0 1 8.24 18.26 L6.36 19.77 L4.23 17.64 L5.74 15.76 A7.3 7.3 0 0 1 4.92 13.77 L2.52 13.50 L2.52 10.50 L4.92 10.23 A7.3 7.3 0 0 1 5.74 8.24 L4.23 6.36 L6.36 4.23 L8.24 5.74 A7.3 7.3 0 0 1 10.23 4.92 Z M8.70 12.00 a3.3 3.3 0 1 0 6.6 0 a3.3 3.3 0 1 0 -6.6 0 Z" />
    </svg>
  )
}

export function SparkleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3.5c.55 4.1 2.2 5.75 6.3 6.3-4.1.55-5.75 2.2-6.3 6.3-.55-4.1-2.2-5.75-6.3-6.3 4.1-.55 5.75-2.2 6.3-6.3Z" />
      <path d="M18.5 15.5c.25 1.85 1 2.6 2.85 2.85-1.85.25-2.6 1-2.85 2.85-.25-1.85-1-2.6-2.85-2.85 1.85-.25 2.6-1 2.85-2.85Z" />
    </svg>
  )
}

export function GlobeIcon({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={className} style={style}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.8 12h16.4M12 3.6c2.3 2.4 3.4 5.2 3.4 8.4S14.3 18 12 20.4C9.7 18 8.6 15.2 8.6 12S9.7 6 12 3.6Z" />
    </svg>
  )
}

export function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
    </svg>
  )
}

export function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function HelpIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.5 2.3c-.7.35-1.1.85-1.1 1.6v.2" />
      <circle cx="12" cy="16.9" r=".9" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  )
}

export function BoltIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m13.2 2.8-7 10h5.1l-.5 8.4 7-10h-5.1z" />
    </svg>
  )
}

export function ReceiptIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5.5 3.5h13v17l-2.2-1.4-2.1 1.4-2.2-1.4-2.1 1.4-2.2-1.4-2.2 1.4z" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  )
}

export function ArrowUpRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  )
}

export function AlertIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5.2M12 16.4v.1" />
    </svg>
  )
}

export function EyeIcon({ className = '', off }: { className?: string; off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {off ? (
        <path d="M3 13c2.2 3.4 5.4 5 9 5s6.8-1.6 9-5M6.5 15.5 5 18M12 18v2.5M17.5 15.5 19 18" />
      ) : (
        <>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  )
}

export function BarsIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 20V13M10 20V6M15 20V10M20 20V4M3 20h18" />
    </svg>
  )
}
