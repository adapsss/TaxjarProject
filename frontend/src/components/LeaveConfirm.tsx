import { Button, Sheet } from './ui'

/** "Are you sure?": shown instead of leaving a screen that has unsaved changes. */
export function LeaveConfirm({ body, onStay, onLeave }: { body: string; onStay: () => void; onLeave: () => void }) {
  return (
    <Sheet label="Are you sure?" onClose={onStay} className="max-h-[70%]">
      <div className="px-5 pt-5 pb-7">
        <h2 className="text-[26px] leading-[1.06] font-extrabold tracking-[-0.04em]">Are you sure?</h2>
        <p className="mt-2 text-[16px] leading-relaxed text-muted">{body}</p>
        <div className="mt-6 space-y-2.5">
          <Button size="lg" className="w-full" onClick={onStay}>
            Keep editing
          </Button>
          <Button size="lg" variant="danger" className="w-full" onClick={onLeave}>
            Leave without saving
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
