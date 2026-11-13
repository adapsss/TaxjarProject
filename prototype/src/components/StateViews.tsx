import { useStore } from '../data/store'
import { AlertIcon, Button, Card } from './ui'

export function LoadError({ what, className = '' }: { what: string; className?: string }) {
  const { retry } = useStore()
  return (
    <Card className={`px-6 py-10 text-center ${className}`}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertIcon className="size-6" />
      </span>
      <h2 className="mt-3 text-[17px] font-extrabold tracking-[-0.02em]">We couldn’t load {what}</h2>
      <p className="mx-auto mt-1.5 max-w-[260px] text-[12.5px] leading-relaxed text-muted">
        Your money is safe. This is a connection problem on our side.
      </p>
      <Button className="mt-5" onClick={retry}>
        Try again
      </Button>
    </Card>
  )
}
