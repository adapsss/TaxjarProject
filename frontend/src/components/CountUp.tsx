import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '../lib/money'

/** Animates a money amount from its previous value, so a reservation landing reads on a projector. */
export function CountUp({ value, currency, className = '' }: { value: number; currency: string; className?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (start === value) return
    // Only money arriving is celebrated; drops (undo, pay, state switch) snap straight to the new value.
    if (value < start) {
      from.current = value
      setShown(value)
      return
    }
    const t0 = performance.now()
    const dur = 900
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(start + (value - start) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = value
    }
  }, [value])

  return <span className={`num ${className}`}>{formatMoney(shown, currency, { cents: shown % 100 !== 0 })}</span>
}
