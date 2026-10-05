import type { Toast } from '../types'
import { MiniIcon } from './Icon'

export function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`anim-toast pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-2xl shadow-black/50 backdrop-blur-md ${
            t.kind === 'ok'
              ? 'border-good/30 bg-[#0d1f1a]/95 text-good'
              : t.kind === 'err'
                ? 'border-bad/30 bg-[#231016]/95 text-bad'
                : 'border-edge-2 bg-panel-2/95 text-fg'
          }`}
        >
          <MiniIcon name={t.kind === 'ok' ? 'check' : t.kind === 'err' ? 'warn' : 'info'} className="h-4 w-4 shrink-0" />
          <span className="font-medium">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
