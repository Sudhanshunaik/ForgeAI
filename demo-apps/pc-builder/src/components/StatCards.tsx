import type { Build, CompatIssue } from '../types'
import { byId } from '../data/catalog'
import { MiniIcon } from './Icon'
import { money } from '../lib/format'
import { estimateWattage, recommendedPsu } from '../lib/power'

interface Props {
  build: Build
  budget: number
  issues: CompatIssue[]
}

export function StatCards({ build, budget, issues }: Props) {
  const total = Object.entries(build).reduce((sum, [k, v]) => {
    if (k === 'storage') return sum + (v as string[]).reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0)
    return sum + (v ? (byId.get(v as string)?.price ?? 0) : 0)
  }, 0)

  const parts = Object.entries(build).filter(([k, v]) => k === 'storage' ? (v as string[]).length > 0 : !!v).length
  const { total: watts } = estimateWattage(build)
  const errors = issues.filter(i => i.severity === 'error').length
  const warnings = issues.filter(i => i.severity === 'warning').length

  const budgetPct = Math.round((total / Math.max(budget, 1)) * 100)
  const over = total > budget

  const cards = [
    {
      icon: 'money' as const,
      label: 'Build total',
      value: money(total),
      sub: total > 0 ? `${budgetPct}% of ${money(budget)} budget` : 'Start adding parts',
      tone: over ? 'text-bad' : 'text-fg',
      chip: over ? { text: 'Over budget', cls: 'bg-bad/15 text-bad' } : total > 0 ? { text: 'On budget', cls: 'bg-good/15 text-good' } : null,
    },
    {
      icon: 'bolt' as const,
      label: 'Estimated draw',
      value: watts > 0 ? `${watts} W` : '—',
      sub: watts > 0 ? `PSU: ${recommendedPsu(watts)}W+ recommended` : 'Add CPU / GPU to estimate',
      tone: 'text-fg',
      chip: null,
    },
    {
      icon: 'chip' as const,
      label: 'Parts selected',
      value: `${parts} / 8`,
      sub: parts === 8 ? 'Build complete!' : parts === 0 ? 'Nothing selected yet' : `${8 - parts} remaining`,
      tone: 'text-fg',
      chip: null,
    },
    {
      icon: errors ? ('x' as const) : warnings ? ('warn' as const) : ('check' as const),
      label: 'Compatibility',
      value: errors ? `${errors} issue${errors > 1 ? 's' : ''}` : warnings ? `${warnings} warning${warnings > 1 ? 's' : ''}` : parts === 0 ? '—' : 'All clear',
      sub: errors ? 'Fix conflicts below' : warnings ? 'Minor things to review' : parts === 0 ? 'Checks run automatically' : 'No conflicts detected',
      tone: errors ? 'text-bad' : warnings ? 'text-warn' : 'text-good',
      chip: null,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c, i) => (
        <div
          key={c.label}
          className="anim-fade-up rounded-2xl border border-edge bg-panel/60 px-4 py-3.5 transition hover:border-edge-2"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-fg-faint">
              <MiniIcon name={c.icon} className="h-3.5 w-3.5" /> {c.label}
            </span>
            {c.chip && <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-bold ${c.chip.cls}`}>{c.chip.text}</span>}
          </div>
          <div className={`tabular mt-2 font-mono text-[20px] font-bold leading-none ${c.tone}`}>{c.value}</div>
          <div className="mt-1.5 text-[11px] text-fg-faint">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
