import type { ReactNode } from 'react'

/** CSS-only hover/focus tooltip with a small dark bubble. */
export function Tooltip({ body, children, className = '' }: { body: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={`tip ${className}`} tabIndex={0}>
      {children}
      <span className="tip-body">
        <span className="block rounded-lg border border-edge-2 bg-[#1c2540] px-2.5 py-1.5 text-[11px] leading-relaxed text-fg-dim shadow-xl shadow-black/40">
          {body}
        </span>
      </span>
    </span>
  )
}
