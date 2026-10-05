import type { Build, CategoryId, CompatIssue } from '../types'
import { CATEGORIES, byId } from '../data/catalog'
import { CategoryIcon, MiniIcon } from './Icon'
import { Tooltip } from './Tooltip'
import { money, clamp } from '../lib/format'
import { estimateWattage, recommendedPsu } from '../lib/power'
import { estimatePerformance } from '../lib/perf'

// ---------------- Build list ----------------

interface BuildListProps {
  build: Build
  onJump: (c: CategoryId) => void
  onRemove: (c: CategoryId, id: string) => void
}

export function BuildList({ build, onJump, onRemove }: BuildListProps) {
  return (
    <div className="rounded-2xl border border-edge bg-panel/60">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-fg-dim">Your build</h3>
        <span className="text-[11px] text-fg-faint">{CATEGORIES.filter(c => (c.id === 'storage' ? build.storage.length > 0 : !!build[c.id])).length}/8 parts</span>
      </div>
      <ul className="divide-y divide-edge/60">
        {CATEGORIES.map(c => {
          const ids: string[] = c.id === 'storage' ? build.storage : (build[c.id] ? [build[c.id] as string] : [])
          if (ids.length === 0) {
            return (
              <li key={c.id}>
                <button onClick={() => onJump(c.id)} className="focus-ring group flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.03]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-dashed border-edge-2 text-fg-faint">
                    <CategoryIcon category={c.id} className="h-4 w-4" />
                  </span>
                  <span className="flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg-faint">{c.label}</span>
                    <span className="block text-[12px] text-fg-faint italic">Not selected — choose one</span>
                  </span>
                  <MiniIcon name="arrow" className="h-3.5 w-3.5 text-fg-faint opacity-0 transition group-hover:opacity-100" />
                </button>
              </li>
            )
          }
          return ids.map(id => {
            const p = byId.get(id)
            if (!p) return null
            return (
              <li key={id} className="anim-slide-right">
                <div className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-edge-2 bg-panel-2 text-accent">
                    <CategoryIcon category={c.id} className="h-4 w-4" />
                  </span>
                  <button onClick={() => onJump(c.id)} className="focus-ring min-w-0 flex-1 text-left" title="Jump to this category">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-fg-faint">{c.label}</span>
                    <span className="block truncate text-[12px] font-medium text-fg">{p.name}</span>
                  </button>
                  <span className="tabular shrink-0 font-mono text-[12px] font-semibold text-fg-dim">{money(p.price)}</span>
                  <button
                    onClick={() => onRemove(c.id, id)}
                    className="focus-ring shrink-0 rounded-md p-1 text-fg-faint opacity-0 transition hover:bg-bad/15 hover:text-bad group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove ${p.name}`}
                  >
                    <MiniIcon name="minus" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            )
          })
        })}
      </ul>
    </div>
  )
}

// ---------------- Wattage ----------------

export function WattageCard({ build }: { build: Build }) {
  const { total, breakdown } = estimateWattage(build)
  const rec = recommendedPsu(total)
  const psu = build.psu ? byId.get(build.psu) : null
  const psuWatts = psu?.specs.kind === 'psu' ? psu.specs.watts : null

  const hasData = breakdown.length > 0
  const pct = psuWatts ? clamp((total / psuWatts) * 100, 0, 100) : null
  const barColor = pct === null ? 'bg-edge-2' : pct > 100 ? 'bg-bad' : pct > 85 ? 'bg-warn' : 'bg-good'

  return (
    <div className="rounded-2xl border border-edge bg-panel/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-fg-dim">
          <MiniIcon name="bolt" className="h-3.5 w-3.5 text-warn" /> Estimated power
        </h3>
        <Tooltip body={<span className="block space-y-0.5">{breakdown.length ? breakdown.map(b => <span key={b.label} className="flex justify-between gap-4"><span className="truncate">{b.label}</span><span className="tabular font-mono">{b.watts}W</span></span>) : 'Add parts to estimate'}</span>}>
          <span className="cursor-help text-[10.5px] text-fg-faint underline decoration-dotted underline-offset-2">breakdown</span>
        </Tooltip>
      </div>

      {!hasData ? (
        <p className="py-3 text-center text-[12px] italic text-fg-faint">Add components to estimate wattage</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="tabular font-mono text-[26px] font-bold text-fg">{total}<span className="ml-0.5 text-[13px] text-fg-faint">W</span></span>
            <span className="text-[11.5px] text-fg-faint">at full load (est.)</span>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-[11.5px]">
              <span className="text-fg-faint">Recommended PSU</span>
              <span className="tabular font-mono font-semibold text-fg-dim">{rec}W+</span>
            </div>
            {psuWatts !== null && (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-ink-2">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${clamp((total / psuWatts!) * 100, 3, 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-fg-faint">{psu!.name}</span>
                  <span className={`font-semibold ${pct! > 100 ? 'text-bad' : pct! > 85 ? 'text-warn' : 'text-good'}`}>
                    {Math.round(pct!)}% load
                  </span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------- Compatibility ----------------

export function CompatPanel({ build, issues }: { build: Build; issues: CompatIssue[] }) {
  const errors = issues.filter(i => i.severity === 'error')
  const warnings = issues.filter(i => i.severity === 'warning')
  const infos = issues.filter(i => i.severity === 'info')
  const anyParts = Object.entries(build).some(([k, v]) => k === 'storage' ? (v as string[]).length > 0 : !!v)

  const sevStyle = {
    error: 'border-bad/30 bg-bad/10 text-bad',
    warning: 'border-warn/30 bg-warn/10 text-warn',
    info: 'border-edge bg-panel-2 text-fg-dim',
  } as const

  return (
    <div className="rounded-2xl border border-edge bg-panel/60">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-fg-dim">Compatibility</h3>
        {anyParts && (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
            errors.length ? 'bg-bad/15 text-bad' : warnings.length ? 'bg-warn/15 text-warn' : 'bg-good/15 text-good'
          }`}>
            {errors.length ? `${errors.length} issue${errors.length > 1 ? 's' : ''}` : warnings.length ? `${warnings.length} warning${warnings.length > 1 ? 's' : ''}` : 'All clear'}
          </span>
        )}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto p-3.5">
        {!anyParts ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-edge bg-panel-2 text-fg-faint"><MiniIcon name="check" className="h-5 w-5" /></span>
            <p className="max-w-[220px] text-[12px] text-fg-faint">Add components and checks run automatically — socket, memory, clearance, power.</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-good/30 bg-good/10 text-good"><MiniIcon name="check" className="h-5 w-5" /></span>
            <p className="text-[12.5px] font-semibold text-good">Everything checks out</p>
            <p className="text-[11.5px] text-fg-faint">No conflicts detected in your current build.</p>
          </div>
        ) : (
          [...errors, ...warnings, ...infos].map(i => (
            <div key={i.id} className={`anim-fade-up rounded-xl border px-3.5 py-2.5 ${sevStyle[i.severity]}`}>
              <div className="flex items-start gap-2">
                <MiniIcon name={i.severity === 'error' ? 'x' : i.severity === 'warning' ? 'warn' : 'info'} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold leading-snug">{i.title}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-fg-dim">{i.detail}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ---------------- Performance ----------------

function PerfBar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11.5px]">
        <span className="font-medium text-fg-dim">{label}</span>
        <span className="tabular font-mono text-[11px] font-semibold text-fg">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-2">
        <div className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export function PerfPanel({ build }: { build: Build }) {
  const perf = estimatePerformance(build)
  const none = !perf.gaming && !perf.productivity && !perf.ai

  return (
    <div className="rounded-2xl border border-edge bg-panel/60">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-fg-dim">Performance estimates</h3>
        <Tooltip body="Rough relative predictions from catalog indices — for comparing builds, not benchmark results.">
          <span className="cursor-help text-[10.5px] text-fg-faint underline decoration-dotted underline-offset-2">what is this?</span>
        </Tooltip>
      </div>
      <div className="space-y-4 p-4">
        {none ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-edge bg-panel-2 text-fg-faint"><MiniIcon name="chart" className="h-5 w-5" /></span>
            <p className="max-w-[220px] text-[12px] text-fg-faint">Select a CPU and GPU to see gaming, productivity and AI estimates.</p>
          </div>
        ) : (
          <>
            {perf.gaming && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg"><MiniIcon name="game" className="h-4 w-4 text-accent" /> Gaming</span>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10.5px] font-bold text-accent">{perf.gaming.tier}</span>
                </div>
                <PerfBar label="Relative score" value={perf.gaming.score} tone="from-accent to-accent-2" />
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[['1080p', perf.gaming.fps1080], ['1440p', perf.gaming.fps1440], ['4K', perf.gaming.fps4k]].map(([res, fps]) => (
                    <Tooltip key={res} body={`Estimated average FPS at ${res} high settings`}>
                      <div className="w-full cursor-help rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-fg-faint">{res}</div>
                        <div className="tabular font-mono text-[13px] font-bold text-fg">{fps}<span className="text-[10px] text-fg-faint"> fps</span></div>
                      </div>
                    </Tooltip>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] italic text-fg-faint">{perf.gaming.note}</p>
              </div>
            )}

            {perf.productivity && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg"><MiniIcon name="chip" className="h-4 w-4 text-emerald-300" /> Productivity</span>
                  <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-300">{perf.productivity.tier}</span>
                </div>
                <PerfBar label="Relative score" value={perf.productivity.score} tone="from-emerald-400 to-teal-400" />
                <p className="mt-1.5 text-[11px] italic text-fg-faint">{perf.productivity.note}</p>
              </div>
            )}

            {perf.ai && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold text-fg"><MiniIcon name="spark" className="h-4 w-4 text-violet-300" /> AI workloads</span>
                  <span className="rounded-full bg-violet-400/10 px-2 py-0.5 text-[10.5px] font-bold text-violet-300">{perf.ai.tier}</span>
                </div>
                <PerfBar label="Relative score" value={perf.ai.score} tone="from-violet-400 to-fuchsia-400" />
                <div className="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-[11.5px]">
                  <span className="text-fg-faint">LLM capability: </span>
                  <span className="font-medium text-fg">{perf.ai.llm}</span>
                </div>
                <p className="mt-1.5 text-[11px] italic text-fg-faint">{perf.ai.note}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- Totals / budget card ----------------

export function TotalsCard({ build, budget }: { build: Build; budget: number }) {
  const total = Object.entries(build).reduce((sum, [k, v]) => {
    if (k === 'storage') return sum + (v as string[]).reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0)
    return sum + (v ? (byId.get(v as string)?.price ?? 0) : 0)
  }, 0)

  const pct = clamp((total / Math.max(budget, 1)) * 100, 0, 100)
  const over = total > budget
  const remaining = budget - total

  return (
    <div className="rounded-2xl border border-edge bg-gradient-to-br from-panel to-panel-2/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-fg-dim">Total</h3>
        {total > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${over ? 'bg-bad/15 text-bad' : 'bg-good/15 text-good'}`}>
            {over ? `${money(-remaining)} over` : `${money(remaining)} left`}
          </span>
        )}
      </div>
      <div className="tabular mt-1 font-mono text-[30px] font-bold tracking-tight text-fg">
        {money(total)}
      </div>
      <div className="mt-3">
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-2">
          <div
            className={`h-full rounded-full transition-all duration-700 ${over ? 'bg-gradient-to-r from-warn to-bad' : 'bg-gradient-to-r from-accent to-accent-2'}`}
            style={{ width: `${total === 0 ? 0 : Math.max(pct, 2)}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-fg-faint">
          <span>Budget <span className="tabular font-mono font-semibold text-fg-dim">{money(budget)}</span></span>
          <span className="tabular font-mono">{Math.round(pct)}%</span>
        </div>
      </div>
    </div>
  )
}
