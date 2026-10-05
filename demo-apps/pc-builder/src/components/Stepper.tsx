import type { CategoryId, Build, CompatIssue } from '../types'
import { CATEGORIES } from '../data/catalog'
import { CategoryIcon, MiniIcon } from './Icon'
import { byId } from '../data/catalog'

interface Props {
  active: CategoryId
  build: Build
  issues: CompatIssue[]
  onPick: (c: CategoryId) => void
}

export function Stepper({ active, build, issues, onPick }: Props) {
  const hasError = (c: CategoryId) => issues.some(i => i.severity === 'error' && i.categories.includes(c))

  const selectedName = (c: CategoryId): string | null => {
    if (c === 'storage') {
      return build.storage.length > 0 ? `${build.storage.length} drive${build.storage.length > 1 ? 's' : ''}` : null
    }
    const id = build[c]
    return id ? byId.get(id)?.name ?? null : null
  }

  const done = (c: CategoryId): boolean =>
    c === 'storage' ? build.storage.length > 0 : !!build[c]

  const count = CATEGORIES.filter(c => done(c.id)).length

  return (
    <div className="rounded-2xl border border-edge bg-panel/60 p-3">
      <div className="mb-2.5 flex items-center justify-between px-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-fg-faint">Build steps</span>
        <span className="tabular font-mono text-[11px] font-semibold text-fg-dim">{count} / {CATEGORIES.length} complete</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar lg:grid lg:grid-cols-8">
        {CATEGORIES.map((c, i) => {
          const isActive = c.id === active
          const isDone = done(c.id)
          const name = selectedName(c.id)
          const err = hasError(c.id)
          return (
            <button
              key={c.id}
              onClick={() => onPick(c.id)}
              className={`focus-ring group relative flex min-w-[112px] flex-col items-start gap-1.5 rounded-xl border px-2.5 py-2.5 text-left transition-all duration-200 ${
                isActive
                  ? 'border-accent/60 bg-accent/10 shadow-lg shadow-accent/10'
                  : isDone
                    ? 'border-edge-2 bg-panel-2 hover:border-accent/40'
                    : 'border-edge bg-panel/40 hover:border-edge-2'
              }`}
            >
              <div className="flex w-full items-center justify-between">
                <span className={`grid h-7 w-7 place-items-center rounded-lg border ${
                  isActive ? 'border-accent/50 bg-accent/15 text-accent'
                    : err ? 'border-bad/40 bg-bad/10 text-bad'
                    : isDone ? 'border-good/40 bg-good/10 text-good'
                    : 'border-edge-2 bg-white/[0.03] text-fg-faint'
                }`}>
                  <CategoryIcon category={c.id} className="h-4 w-4" />
                </span>
                <span className={`text-[9px] font-bold ${err ? 'text-bad' : isDone ? 'text-good' : 'text-fg-faint'}`}>
                  {err ? <MiniIcon name="warn" className="h-3.5 w-3.5" /> : isDone ? <MiniIcon name="check" className="h-3.5 w-3.5" /> : `0${i + 1}`}
                </span>
              </div>
              <div className="w-full">
                <div className={`text-[11.5px] font-semibold ${isActive ? 'text-accent' : 'text-fg'}`}>{c.label}</div>
                <div className="mt-0.5 truncate text-[10px] leading-tight text-fg-faint" title={name ?? undefined}>
                  {name ?? 'Not selected'}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
