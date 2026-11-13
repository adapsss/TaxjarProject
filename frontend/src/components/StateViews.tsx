import { useStore } from '../state/store'
import { Button } from './ui'

export function LoadError({ what, className = '' }: { what: string; className?: string }) {
  const { retry } = useStore()
  return (
    <div className={`rounded-3xl border border-line bg-white px-8 py-12 text-center ${className}`}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-xl font-bold text-danger">!</span>
      <h2 className="mt-4 text-[20px] font-bold">We couldn’t load {what}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[15px] text-muted">Your money is safe. This is a connection problem on our side.</p>
      <Button className="mt-6" onClick={retry}>
        Try again
      </Button>
    </div>
  )
}
