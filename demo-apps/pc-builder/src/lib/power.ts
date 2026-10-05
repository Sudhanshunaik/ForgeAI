import type { Build, Product, WattBreakdown } from '../types'
import { byId } from '../data/catalog'

/**
 * Rough system power estimate. Real draw varies by load, overclock and PSU
 * efficiency — this is a planning estimate, not a measurement.
 */
export function estimateWattage(build: Build): { total: number; breakdown: WattBreakdown[] } {
  const breakdown: WattBreakdown[] = []
  const get = (id: string | null): Product | undefined => (id ? byId.get(id) : undefined)

  const cpu = get(build.cpu)
  if (cpu && cpu.specs.kind === 'cpu') {
    breakdown.push({ label: `CPU — ${cpu.name}`, watts: cpu.specs.tdp })
  }

  const gpu = get(build.gpu)
  if (gpu && gpu.specs.kind === 'gpu') {
    breakdown.push({ label: `GPU — ${gpu.name}`, watts: gpu.specs.tdp })
  }

  if (build.motherboard) breakdown.push({ label: 'Motherboard & chipset', watts: 35 })
  if (build.ram) breakdown.push({ label: 'Memory', watts: 6 })

  const drives = build.storage.length
  if (drives > 0) {
    let w = 0
    for (const id of build.storage) {
      const d = byId.get(id)
      if (!d || d.specs.kind !== 'storage') continue
      w += d.specs.interface === 'HDD' ? 10 : 8
    }
    breakdown.push({ label: `Storage (${drives} drive${drives > 1 ? 's' : ''})`, watts: w })
  }

  const cooler = get(build.cooler)
  if (cooler && cooler.specs.kind === 'cooler') {
    breakdown.push({ label: 'CPU cooler', watts: cooler.specs.type === 'Liquid' ? 14 : 6 })
  }

  if (build.case) breakdown.push({ label: 'Case fans & accessories', watts: 12 })

  const total = Math.ceil(breakdown.reduce((s, b) => s + b.watts, 0) / 10) * 10
  return { total, breakdown }
}

/** Recommended PSU size: estimate + ~40% peak headroom, rounded to 50W. */
export function recommendedPsu(total: number): number {
  return Math.max(450, Math.ceil((total * 1.4) / 50) * 50)
}
