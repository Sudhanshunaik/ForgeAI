import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Build, CategoryId, Product, Toast as ToastT } from './types'
import { CATEGORIES, byId } from './data/catalog'
import { checkBuild } from './lib/compat'
import { money } from './lib/format'
import { Stepper } from './components/Stepper'
import { Catalog } from './components/Catalog'
import { ProductModal } from './components/ProductModal'
import { BuildList, WattageCard, CompatPanel, PerfPanel, TotalsCard } from './components/Sidebar'
import { StatCards } from './components/StatCards'
import { ToastStack } from './components/Toast'
import { MiniIcon } from './components/Icon'
import { estimatePerformance } from './lib/perf'
import { estimateWattage } from './lib/power'

const EMPTY_BUILD: Build = {
  cpu: null, motherboard: null, ram: null, gpu: null,
  storage: [], psu: null, case: null, cooler: null,
}
const STORE_KEY = 'rigforge-build-v1'
const DEFAULT_BUDGET = 150000

// ---------- share encoding ----------
function encodeState(build: Build, budget: number): string {
  const compact: Record<string, unknown> = { b: budget, s: build.storage }
  for (const k of ['cpu', 'motherboard', 'ram', 'gpu', 'psu', 'case', 'cooler'] as const) {
    if (build[k]) compact[k] = build[k]
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(compact))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeState(hash: string): { build: Build; budget: number } | null {
  try {
    const b64 = hash.replace(/-/g, '+').replace(/_/g, '/')
    const raw = JSON.parse(decodeURIComponent(escape(atob(b64)))) as Record<string, unknown>
    const build: Build = { ...EMPTY_BUILD, storage: Array.isArray(raw.s) ? (raw.s as string[]).filter(id => byId.has(id)) : [] }
    for (const k of ['cpu', 'motherboard', 'ram', 'gpu', 'psu', 'case', 'cooler'] as const) {
      const v = raw[k]
      if (typeof v === 'string' && byId.has(v)) build[k] = v
    }
    const budget = typeof raw.b === 'number' && raw.b > 0 ? raw.b : DEFAULT_BUDGET
    return { build, budget }
  } catch {
    return null
  }
}

export default function App() {
  const [build, setBuild] = useState<Build>(() => {
    const fromHash = window.location.hash.startsWith('#b=') ? decodeState(window.location.hash.slice(3)) : null
    if (fromHash) return fromHash.build
    try {
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { build?: Build }
        if (parsed.build) return { ...EMPTY_BUILD, ...parsed.build }
      }
    } catch { /* ignore */ }
    return EMPTY_BUILD
  })
  const [budget, setBudget] = useState<number>(() => {
    const fromHash = window.location.hash.startsWith('#b=') ? decodeState(window.location.hash.slice(3)) : null
    if (fromHash) return fromHash.budget
    try {
      const saved = localStorage.getItem(STORE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { budget?: number }
        if (parsed.budget && parsed.budget > 0) return parsed.budget
      }
    } catch { /* ignore */ }
    return DEFAULT_BUDGET
  })
  const [active, setActive] = useState<CategoryId>('cpu')
  const [modalProduct, setModalProduct] = useState<Product | null>(null)
  const [toasts, setToasts] = useState<ToastT[]>([])
  const [saveTick, setSaveTick] = useState(0)     // bumps on every change → "autosaved" pulse
  const toastId = useRef(0)
  const autosaveLabel = useRef<HTMLSpanElement>(null)

  const toast = useCallback((message: string, kind: ToastT['kind'] = 'ok') => {
    const id = ++toastId.current
    setToasts(t => [...t.slice(-2), { id, message, kind }])
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])

  // ---------- autosave (debounced) ----------
  useEffect(() => {
    setSaveTick(t => t + 1)
    const h = window.setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify({ build, budget })) } catch { /* ignore */ }
    }, 400)
    return () => window.clearTimeout(h)
  }, [build, budget])

  // subtle "saved" pulse in the header
  useEffect(() => {
    if (saveTick <= 1) return
    const el = autosaveLabel.current
    if (!el) return
    el.classList.remove('opacity-0')
    const h = window.setTimeout(() => el.classList.add('opacity-0'), 900)
    return () => window.clearTimeout(h)
  }, [saveTick])

  // ---------- derived ----------
  const issues = useMemo(() => checkBuild(build), [build])
  const storageTotal = build.storage.reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0)

  // ---------- actions ----------
  const selectProduct = useCallback((p: Product) => {
    setBuild(prev => {
      if (p.category === 'storage') {
        if (prev.storage.includes(p.id)) return prev
        if (prev.storage.length >= 4) { toast('Max 4 drives in this demo build', 'err'); return prev }
        return { ...prev, storage: [...prev.storage, p.id] }
      }
      if (prev[p.category] === p.id) return prev
      return { ...prev, [p.category]: p.id }
    })
    toast(`${p.name} added`, 'ok')
  }, [toast])

  const removeProduct = useCallback((category: CategoryId, id: string) => {
    setBuild(prev => category === 'storage'
      ? { ...prev, storage: prev.storage.filter(s => s !== id) }
      : { ...prev, [category]: null })
  }, [])

  const removeFromModal = useCallback((p: Product) => {
    if (p.category === 'storage') {
      setBuild(prev => ({ ...prev, storage: prev.storage.filter(s => s !== p.id) }))
    } else {
      setBuild(prev => ({ ...prev, [p.category]: null }))
    }
    toast(`${p.name} removed`, 'info')
  }, [toast])

  const saveNow = useCallback(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ build, budget }))
      toast('Build saved to this browser', 'ok')
    } catch {
      toast('Could not save (storage blocked)', 'err')
    }
  }, [build, budget, toast])

  const resetBuild = useCallback(() => {
    setBuild(EMPTY_BUILD)
    setActive('cpu')
    toast('Build reset — starting fresh', 'info')
  }, [toast])

  const shareBuild = useCallback(async () => {
    const hasParts = Object.entries(build).some(([k, v]) => k === 'storage' ? (v as string[]).length > 0 : !!v)
    if (!hasParts) { toast('Add some parts before sharing', 'err'); return }
    const url = `${window.location.origin}${window.location.pathname}#b=${encodeState(build, budget)}`
    try {
      await navigator.clipboard.writeText(url)
      toast('Share link copied to clipboard', 'ok')
    } catch {
      window.prompt('Copy your share link:', url)
    }
    window.history.replaceState(null, '', `#b=${encodeState(build, budget)}`)
  }, [build, budget, toast])

  const copySummary = useCallback(async () => {
    const lines: string[] = [`My RIGFORGE build — ${money(buildTotal(build))}`, '']
    for (const c of CATEGORIES) {
      if (c.id === 'storage') {
        build.storage.forEach(id => lines.push(`• ${c.label}: ${byId.get(id)?.name}`))
      } else {
        const id = build[c.id]
        if (id) lines.push(`• ${c.label}: ${byId.get(id)?.name}`)
      }
    }
    const { total } = estimateWattage(build)
    if (total) lines.push('', `Estimated draw: ~${total}W`)
    const perf = estimatePerformance(build)
    if (perf.gaming) lines.push(`Gaming score: ${perf.gaming.score}/100 (~${perf.gaming.fps1440} fps @ 1440p est.)`)
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast('Build summary copied as text', 'ok')
    } catch {
      toast('Clipboard unavailable', 'err')
    }
  }, [build, toast])

  const onPickStep = useCallback((c: CategoryId) => {
    setActive(c)
    document.getElementById('catalog-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="bg-grid min-h-screen">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-[70] border-b border-edge bg-ink/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 text-ink shadow-lg shadow-accent/25">
              <MiniIcon name="chip" className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-[15px] font-extrabold tracking-tight">RIGFORGE</div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-fg-faint">PC Builder</div>
            </div>
          </div>

          <span ref={autosaveLabel} className="opacity-0 transition-opacity duration-300 text-[11px] font-medium text-good">
            ● autosaved
          </span>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* budget control */}
            <label className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-fg-faint">Budget</span>
              <span className="text-fg-faint">₹</span>
              <input
                type="number"
                min={10000}
                step={5000}
                value={budget}
                onChange={e => setBudget(Math.max(0, Number(e.target.value) || 0))}
                className="tabular w-24 bg-transparent font-mono text-[13px] font-semibold text-fg outline-none"
                aria-label="Budget in rupees"
              />
            </label>

            <button onClick={saveNow} className="focus-ring flex items-center gap-1.5 rounded-xl border border-edge bg-panel px-3 py-2 text-[12px] font-semibold text-fg-dim transition hover:border-accent/40 hover:text-fg">
              <MiniIcon name="save" className="h-4 w-4" /> Save
            </button>
            <button onClick={shareBuild} className="focus-ring flex items-center gap-1.5 rounded-xl border border-edge bg-panel px-3 py-2 text-[12px] font-semibold text-fg-dim transition hover:border-accent/40 hover:text-fg">
              <MiniIcon name="share" className="h-4 w-4" /> Share
            </button>
            <button onClick={copySummary} className="focus-ring hidden items-center gap-1.5 rounded-xl border border-edge bg-panel px-3 py-2 text-[12px] font-semibold text-fg-dim transition hover:border-accent/40 hover:text-fg sm:flex">
              <MiniIcon name="info" className="h-4 w-4" /> Copy list
            </button>
            <button onClick={resetBuild} className="focus-ring flex items-center gap-1.5 rounded-xl border border-edge bg-panel px-3 py-2 text-[12px] font-semibold text-fg-dim transition hover:border-bad/40 hover:text-bad">
              <MiniIcon name="reset" className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>
      </header>

      {/* ---------- body ---------- */}
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6">
        {/* hero line */}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight sm:text-[26px]">
              Build your next PC, <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">part by part</span>
            </h1>
            <p className="mt-1 max-w-2xl text-[12.5px] text-fg-faint">
              Live compatibility, wattage and performance as you pick. Sample catalog for this demo — no account, everything local.
            </p>
          </div>
          <div className="text-[11px] text-fg-faint">
            Tip: press <kbd className="rounded border border-edge-2 bg-panel-2 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd> to close dialogs
          </div>
        </div>

        <div className="mb-5"><StatCards build={build} budget={budget} issues={issues} /></div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* left column */}
          <div className="min-w-0 space-y-5">
            <Stepper active={active} build={build} issues={issues} onPick={onPickStep} />
            <div id="catalog-anchor" className="scroll-mt-20">
              <Catalog
                category={active}
                build={build}
                onSelect={selectProduct}
                onRemove={p => removeProduct(p.category, p.id)}
                onOpen={setModalProduct}
              />
            </div>
          </div>

          {/* right column */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-[76px] lg:max-h-[calc(100vh-92px)] lg:self-start lg:overflow-y-auto lg:pr-1">
            <TotalsCard build={build} budget={budget} />
            <BuildList
              build={build}
              onJump={onPickStep}
              onRemove={(c, id) => { removeProduct(c, id); toast('Part removed', 'info') }}
            />
            <WattageCard build={build} />
            <CompatPanel build={build} issues={issues} />
            <PerfPanel build={build} />
            {storageTotal > 0 && (
              <p className="px-1 text-[11px] text-fg-faint">
                Including {money(storageTotal)} of storage across {build.storage.length} drive{build.storage.length > 1 ? 's' : ''}.
              </p>
            )}
          </aside>
        </div>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-edge bg-ink/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[11px] text-fg-faint sm:px-6">
          <span>RIGFORGE demo · sample prices &amp; performance figures are illustrative estimates</span>
          <span>Saved locally in your browser · share links encode the build in the URL</span>
        </div>
      </footer>

      {modalProduct && (
        <ProductModal
          product={modalProduct}
          build={build}
          onClose={() => setModalProduct(null)}
          onSelect={p => { selectProduct(p) }}
          onRemove={removeFromModal}
        />
      )}

      <ToastStack toasts={toasts} />
    </div>
  )
}

function buildTotal(build: Build): number {
  return Object.entries(build).reduce((sum, [k, v]) => {
    if (k === 'storage') return sum + (v as string[]).reduce((s, id) => s + (byId.get(id)?.price ?? 0), 0)
    return sum + (v ? (byId.get(v as string)?.price ?? 0) : 0)
  }, 0)
}
