import { useEffect } from 'react'
import type { Product, Build } from '../types'
import { byId, productsIn } from '../data/catalog'
import { CategoryIcon, MiniIcon } from './Icon'
import { specTable, perfIndex } from '../lib/specs'
import { money } from '../lib/format'
import { candidateIssues } from '../lib/compat'

interface Props {
  product: Product
  build: Build
  onClose: () => void
  onSelect: (p: Product) => void
  onRemove: (p: Product) => void
}

export function ProductModal({ product, build, onClose, onSelect, onRemove }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const currentId = product.category === 'storage' ? null : (build[product.category] as string | null)
  const current = currentId ? byId.get(currentId) : null
  const inBuild = product.category === 'storage'
    ? build.storage.includes(product.id)
    : currentId === product.id

  const issues = candidateIssues(build, product)
  const rows = specTable(product)
  const currentRows = current ? specTable(current) : []
  const sameCategory = productsIn(product.category)

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="anim-pop max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-edge-2 bg-ink-2 shadow-2xl shadow-black/60 sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${product.name} details`}
      >
        {/* header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-edge bg-ink-2/95 p-5 backdrop-blur">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-edge-2 bg-panel-2 text-accent">
              <CategoryIcon category={product.category} className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-fg-faint">{product.brand}</div>
              <h2 className="text-[15px] font-bold leading-snug">{product.name}</h2>
              <div className="tabular mt-0.5 font-mono text-[13px] font-semibold text-accent">{money(product.price)}</div>
            </div>
          </div>
          <button onClick={onClose} className="focus-ring rounded-lg border border-edge p-1.5 text-fg-dim transition hover:border-edge-2 hover:text-fg" aria-label="Close">
            <MiniIcon name="close" className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* compatibility preview */}
          {issues.length > 0 && (
            <div className="space-y-2">
              {issues.map(i => (
                <div key={i.id} className="flex items-start gap-2.5 rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5">
                  <MiniIcon name="warn" className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
                  <div>
                    <div className="text-[12.5px] font-semibold text-bad">{i.title}</div>
                    <div className="text-[11.5px] leading-relaxed text-fg-dim">{i.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* spec table + compare */}
          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-fg-faint">
              {current && current.id !== product.id ? 'Comparison' : 'Specifications'}
            </h3>
            {current && current.id !== product.id ? (
              <div className="overflow-hidden rounded-xl border border-edge">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-edge bg-panel text-left text-[10.5px] uppercase tracking-wider text-fg-faint">
                      <th className="px-3.5 py-2 font-semibold">Spec</th>
                      <th className="px-3.5 py-2 font-semibold text-accent">This product</th>
                      <th className="px-3.5 py-2 font-semibold">In your build</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([label], idx) => {
                      const mine = rows[idx][1]
                      const theirs = currentRows.find(r => r[0] === label)?.[1] ?? '—'
                      const diff = mine !== theirs
                      return (
                        <tr key={label} className="border-b border-edge/60 last:border-0">
                          <td className="px-3.5 py-2 text-fg-faint">{label}</td>
                          <td className={`px-3.5 py-2 font-medium ${diff ? 'text-accent' : 'text-fg'}`}>{mine}</td>
                          <td className={`px-3.5 py-2 ${diff ? 'text-fg-dim' : 'text-fg'}`}>{theirs}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-panel/60">
                      <td className="px-3.5 py-2 text-fg-faint">Relative performance</td>
                      <td className="px-3.5 py-2 font-semibold text-accent">{Math.round(perfIndex(product))} pts</td>
                      <td className="px-3.5 py-2 text-fg-dim">{Math.round(perfIndex(current))} pts</td>
                    </tr>
                    <tr className="bg-panel/60">
                      <td className="px-3.5 py-2 text-fg-faint">Price</td>
                      <td className="px-3.5 py-2 font-semibold text-accent">{money(product.price)}</td>
                      <td className="px-3.5 py-2 text-fg-dim">{money(current.price)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-edge">
                <table className="w-full text-[12px]">
                  <tbody>
                    {rows.map(([label, value]) => (
                      <tr key={label} className="border-b border-edge/60 last:border-0">
                        <td className="px-3.5 py-2 text-fg-faint">{label}</td>
                        <td className="px-3.5 py-2 font-medium text-fg">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* siblings in category */}
          <div>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-fg-faint">Others in this category</h3>
            <div className="flex flex-wrap gap-1.5">
              {sameCategory.filter(p => p.id !== product.id).map(p => (
                <span key={p.id} className={`rounded-lg border px-2.5 py-1 text-[11px] ${
                  (product.category === 'storage' ? build.storage.includes(p.id) : build[product.category] === p.id)
                    ? 'border-good/30 bg-good/10 text-good'
                    : 'border-edge bg-panel text-fg-dim'
                }`}>
                  {p.name} · {money(p.price)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* footer actions */}
        <div className="sticky bottom-0 flex gap-2.5 border-t border-edge bg-ink-2/95 p-4 backdrop-blur">
          {inBuild ? (
            <button
              onClick={() => { onRemove(product); onClose() }}
              className="focus-ring flex-1 rounded-xl border border-good/30 bg-good/10 py-2.5 text-[13px] font-semibold text-good transition hover:bg-good/20"
            >
              ✓ In your build — remove
            </button>
          ) : (
            <button
              onClick={() => { onSelect(product); onClose() }}
              className="focus-ring flex-1 rounded-xl bg-gradient-to-r from-accent to-accent-2 py-2.5 text-[13px] font-bold text-ink transition hover:brightness-110"
            >
              {issues.length > 0 ? `Select anyway (${issues.length} conflict${issues.length > 1 ? 's' : ''})` : '+ Add to build'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
