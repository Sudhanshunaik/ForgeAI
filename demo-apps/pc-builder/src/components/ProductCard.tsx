import type { Product, CategoryId, CompatIssue } from '../types'
import { CategoryIcon, MiniIcon } from './Icon'
import { Tooltip } from './Tooltip'
import { specChips } from '../lib/specs'
import { money } from '../lib/format'

const TILE_GRADIENTS: Record<CategoryId, string> = {
  cpu: 'from-cyan-500/15 to-blue-500/5 text-cyan-300',
  gpu: 'from-violet-500/15 to-fuchsia-500/5 text-violet-300',
  motherboard: 'from-emerald-500/15 to-teal-500/5 text-emerald-300',
  ram: 'from-amber-500/15 to-orange-500/5 text-amber-300',
  storage: 'from-sky-500/15 to-indigo-500/5 text-sky-300',
  psu: 'from-rose-500/15 to-red-500/5 text-rose-300',
  case: 'from-lime-500/15 to-green-500/5 text-lime-300',
  cooler: 'from-blue-500/15 to-violet-500/5 text-blue-300',
}

interface Props {
  product: Product
  selected: boolean
  conflicts: CompatIssue[]        // error-severity against current build
  onOpen: () => void
  onSelect: () => void
  onRemove?: () => void
  index: number
}

export function ProductCard({ product, selected, conflicts, onOpen, onSelect, onRemove, index }: Props) {
  const blocked = conflicts.length > 0 && !selected
  return (
    <article
      className={`anim-fade-up group relative flex flex-col rounded-2xl border transition-all duration-200 ${
        selected
          ? 'border-accent/60 bg-panel-2 shadow-lg shadow-accent/10'
          : blocked
            ? 'border-bad/25 bg-panel/60 hover:border-bad/40'
            : 'border-edge bg-panel/70 hover:-translate-y-0.5 hover:border-edge-2 hover:shadow-xl hover:shadow-black/30'
      }`}
      style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
    >
      {selected && (
        <span className="anim-pop absolute -right-1.5 -top-1.5 z-10 grid h-6 w-6 place-items-center rounded-full bg-accent text-ink shadow-lg shadow-accent/40">
          <MiniIcon name="check" className="h-3.5 w-3.5" />
        </span>
      )}

      <button onClick={onOpen} className="focus-ring flex flex-1 flex-col rounded-2xl p-4 text-left" aria-label={`Details for ${product.name}`}>
        {/* tile */}
        <div className={`mb-3 grid h-24 place-items-center rounded-xl border border-white/5 bg-gradient-to-br ${TILE_GRADIENTS[product.category]}`}>
          <CategoryIcon category={product.category} className="h-11 w-11 transition-transform duration-300 group-hover:scale-110" />
        </div>

        <div className="mb-1 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-fg-faint">{product.brand}</span>
          {blocked && (
            <Tooltip body={conflicts[0].title}>
              <span className="inline-flex items-center gap-1 rounded-full border border-bad/30 bg-bad/10 px-1.5 py-0.5 text-[10px] font-semibold text-bad">
                <MiniIcon name="warn" className="h-3 w-3" /> Incompatible
              </span>
            </Tooltip>
          )}
        </div>
        <h3 className="mb-2 min-h-[2.4em] text-[13.5px] font-semibold leading-snug text-fg">{product.name}</h3>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {specChips(product).slice(0, 4).map(chip => (
            <span key={chip} className="rounded-md border border-white/5 bg-white/[0.04] px-1.5 py-0.5 text-[10.5px] font-medium text-fg-dim">{chip}</span>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-between pt-1">
          <span className="tabular font-mono text-[15px] font-bold text-fg">{money(product.price)}</span>
          <span className="text-[10.5px] font-medium text-fg-faint opacity-0 transition-opacity group-hover:opacity-100">View details →</span>
        </div>
      </button>

      <div className="px-4 pb-4">
        {selected && onRemove ? (
          <button
            onClick={onRemove}
            className="focus-ring w-full rounded-lg border border-good/30 bg-good/10 py-1.5 text-[12px] font-semibold text-good transition hover:bg-good/20"
          >
            ✓ In build — remove
          </button>
        ) : (
          <button
            onClick={onSelect}
            className={`focus-ring w-full rounded-lg py-1.5 text-[12px] font-semibold transition ${
              selected
                ? 'border border-good/30 bg-good/10 text-good'
                : blocked
                  ? 'border border-bad/25 bg-white/[0.03] text-fg-dim hover:bg-bad/10 hover:text-bad'
                  : 'border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20'
            }`}
          >
            {selected ? '✓ In build' : blocked ? 'Select anyway' : '+ Add to build'}
          </button>
        )}
      </div>
    </article>
  )
}
