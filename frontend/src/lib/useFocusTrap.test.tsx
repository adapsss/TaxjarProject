import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useFocusTrap } from './useFocusTrap'

function Panel() {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  return (
    <div ref={ref} tabIndex={-1}>
      <button>Close</button>
    </div>
  )
}

afterEach(() => vi.restoreAllMocks())

it('focuses the panel without scrolling it into view', () => {
  // A sheet slides up from below the screen: focusing it normally would scroll the screen's
  // overflow:hidden container to reveal it, throwing the whole UI out of place.
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  render(<Panel />)
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
})
