import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { DISCLAIMER, type Tag as TagName } from '../data/engine'
import type { Counterparty } from '../data/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lime text-forest hover:bg-[#b5f08b] active:bg-[#98dc68]',
  secondary: 'bg-white text-forest ring-1 ring-inset ring-forest/80 hover:bg-lime-soft',
  ghost: 'text-forest hover:bg-forest/5',
  dark: 'bg-forest text-white hover:bg-forest-2',
  danger: 'bg-white text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-soft',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const sizes = { sm: 'h-8 px-3.5 text-[13px]', md: 'h-10 px-5 text-sm', lg: 'h-12 px-6 text-[15px]' }
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:cursor-not-allowed disabled:opacity-45 ${sizes[size]} ${VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return <span className={`size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} />
}

const TAG_STYLE: Record<Exclude<TagName, null>, string> = {
  'Tax set aside': 'bg-lime-soft text-lime-ink',
  'Tax paid': 'bg-forest/8 text-forest',
  Personal: 'bg-black/[0.05] text-muted',
  'Needs your answer': 'bg-amber-soft text-amber-ink',
}

export function Tag({ name, children }: { name: Exclude<TagName, null>; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TAG_STYLE[name]}`}>
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

export function Avatar({ who, size = 40 }: { who: Counterparty; size?: number }) {
  const company = who.kind === 'company'
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      className={`grid shrink-0 place-items-center font-bold ${
        company ? 'rounded-xl bg-forest text-lime' : 'rounded-full bg-[#e9ece4] text-forest'
      }`}
    >
      {initials(who.name)}
    </span>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl border border-line bg-white ${className}`}>{children}</div>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-black/[0.06] ${className}`} />
}

export function Disclaimer({ dark, className = '' }: { dark?: boolean; className?: string }) {
  return (
    <p className={`flex items-start gap-1.5 text-xs leading-snug ${dark ? 'text-lime/70' : 'text-muted'} ${className}`}>
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      {DISCLAIMER}
    </p>
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

export function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
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

export function CloseIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function Flag({ currency, size = 28 }: { currency: string; size?: number }) {
  const bg: Record<string, string> = { EUR: '#2c56c9', USD: '#a8233a', GBP: '#13235b' }
  const sym: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
  return (
    <span
      style={{ width: size, height: size, background: bg[currency] ?? '#555', fontSize: size * 0.45 }}
      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
    >
      {sym[currency] ?? currency[0]}
    </span>
  )
}
