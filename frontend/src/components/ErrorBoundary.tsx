import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  failed: boolean
}

/**
 * Catches an error thrown while rendering any screen, so the user sees a way back instead of a
 * blank page. It sits outside the store and the router and uses nothing from them (and no shared
 * component): whatever broke below must not be able to break this too.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The app could not draw this screen:', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main role="alert" className="mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-[22px] font-extrabold tracking-[-0.03em]">Something went wrong on this screen</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Your money is safe: nothing moved. Reload to carry on where you were.
        </p>
        <button
          type="button"
          className="mt-6 rounded-full bg-lime px-6 py-3 text-[15px] font-bold text-forest"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
        <a className="mt-4 text-[14px] font-semibold text-forest underline" href="/">
          Go to Home
        </a>
      </main>
    )
  }
}
