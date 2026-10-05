import { useMemo, useState } from 'react'
import type { CategoryId, Build, Product, CompatIssue } from '../types'
import { CATEGORIES, productsIn, BRANDS_BY_CATEGORY } from '../data/catalog'
import { ProductCard } from './ProductCard'
import { MiniIcon } from './Icon'
import { candidateIssues } from '../lib/compat'
import { perfIndex } from '../lib/specs'
import { money } from '../lib/format'

interface Props {
  category: CategoryId
  build: Build
  onSelect: (p: Product) => void
  onRemove: (p: Product) => void
  onOpen: (p: Product) => void
}

type SortKey = 'perf' | 'price-asc' | 'price-desc'

export function Catalog({ category, build, onSelect, onRemove, onOpen }: Props) {
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('perf')
  const [compatOnly, setCompatOnly] = useState(false)

  const meta = CATEGORIES.find(c => c.id === category)!
  const brands = BRANDS_BY_CATEGORY[category]

  const items = useMemo(() => productsIn(category), [category])

  const conflictMap = useMemo(() => {
    const m = new Map<string, CompatIssue[]>()
    for (const p of items) m.set(p.id, candidateIssues(build, p))
    return m
  }, [items, build])

  const filtered = useMemo(() => {
    let list = items
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(p => (p.name + ' ' + p.brand).toLowerCase().includes(q))
    }
    if (brand) list = list.filter(p => p.brand === brand)
    if (compatOnly) list = list.filter(p => (conflictMap.get(p.id) ?? []).length === 0 || isSelected(p))
    const sorted = [...list]
    if (sort === 'perf') sorted.sort((a, b) => perfIndex(b) - perfIndex(a))
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price)
    if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price)
    return sorted
  }, [items, query, brand, sort, compatOnly, conflictMap, build])

  function isSelected(p: Product): boolean {
    return p.category === 'storage' ? build.storage.includes(p.id) : build[p.category] === p.id
  }

  const resetFilters = () => { setQuery(''); setBrand(null); setSort('perf'); setCompatOnly(false) }
  const selectCls = 'focus-ring rounded-lg border border-edge bg-panel-2 px-3 py-2 text-[12px] text-fg outline-none transition focus:border-accent/60'

  return (
    <section className="rounded-2xl border border-edge bg-panel/40">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold">{meta.label} <span className="ml-1 font-medium text-fg-faint">— {meta.blurb}</span></h2>
          <p className="mt-0.5 text-[11.5px] text-fg-faint">
            {items.length} products · {category === 'storage' ? 'pick multiple drives' : 'pick one'}
          </p>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-[12px] text-fg-dim transition hover:border-edge-2">
          <button
            role="switch"
            aria-checked={compatOnly}
            onClick={() => setCompatOnly(v => !v)}
            className={`focus-ring relative h-4.5 w-8 rounded-full transition-colors ${compatOnly ? 'bg-accent' : 'bg-edge-2'}`}
          >
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all ${compatOnly ? 'left-4' : 'left-0.5'}`} />
          </button>
          Compatible only
        </label>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-edge px-5 py-3.5">
        <div className="relative min-w-[180px] flex-1">
          <MiniIcon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${meta.label.toLowerCase()}… e.g. "${items[0]?.brand ?? ''}"`}
            className="focus-ring w-full rounded-lg border border-edge bg-panel-2 py-2 pl-9 pr-8 text-[12px] text-fg outline-none transition placeholder:text-fg-faint focus:border-accent/60"
          />
          {query && (
            <button onClick={() => setQuery('')} className="focus-ring absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-faint hover:text-fg" aria-label="Clear search">
              <MiniIcon name="close" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select value={brand ?? ''} onChange={e => setBrand(e.target.value || null)} className={selectCls} aria-label="Filter by brand">
          <option value="">All brands</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className={selectCls} aria-label="Sort products">
          <option value="perf">Best performance</option>
          <option value="price-asc">Price: low → high</option>
          <option value="price-desc">Price: high → low</option>
        </select>
        <span className="tabular ml-auto font-mono text-[11px] text-fg-faint">{filtered.length} shown</span>
      </div>

      {/* grid */}
      <div className="p-5">
        {filtered.length === 0 ? (
          <div className="anim-fade-up flex flex-col items-center gap-3 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-edge bg-panel-2 text-fg-faint">
              <MiniIcon name="search" className="h-6 w-6" />
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-fg">No matches</div>
              <div className="mt-1 text-[12px] text-fg-faint">
                Nothing fits these filters{compatOnly ? ' — try turning off "Compatible only"' : ''}.{' '}
                <button onClick={resetFilters} className="font-semibold text-accent underline-offset-2 hover:underline">Reset filters</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p, i) => (
              <ProductCard
                key={p.id}
                product={p}
                index={i}
                selected={isSelected(p)}
                conflicts={conflictMap.get(p.id) ?? []}
                onOpen={() => onOpen(p)}
                onSelect={() => onSelect(p)}
                onRemove={() => onRemove(p)}
              />
            ))}
          </div>
        )}

        {/* bottom helper */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-edge bg-panel/60 px-4 py-3 text-[11.5px] text-fg-faint">
          <MiniIcon name="info" className="h-4 w-4 shrink-0 text-accent" />
          <span>
            Prices are sample data for this demo. Estimated build so far:{' '}
            <span className="tabular font-mono font-semibold text-fg-dim">
              {money(items.reduce((s, p) => s + (isSelected(p) ? p.price : 0), 0))}
            </span>{' '}
            in {meta.label}.
          </span>
        </div>
      </div>
    </section>
  )
}
