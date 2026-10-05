import type { Product } from '../types'

/** Human-readable spec chips for compact cards. */
export function specChips(p: Product): string[] {
  const s = p.specs
  switch (s.kind) {
    case 'cpu':
      return [`${s.cores}C / ${s.threads}T`, `${s.boostClock.toFixed(1)} GHz boost`, `${s.socket}`, `${s.tdp}W TDP`]
    case 'gpu':
      return [`${s.vram}GB VRAM`, `${s.length}mm long`, `${s.tdp}W`, s.rayTracing ? 'Ray tracing' : 'Raster only']
    case 'motherboard':
      return [s.socket, s.formFactor, s.memoryType, `${s.m2Slots}× M.2`, s.wifi ? 'WiFi' : 'No WiFi']
    case 'ram':
      return [`${s.capacity}GB kit`, `${s.type}-${s.speed}`, `CL${s.casLatency}`, `${s.modules} modules`]
    case 'storage':
      return [`${s.capacity >= 1000 ? `${s.capacity / 1000}TB` : `${s.capacity}GB`}`, s.interface, s.formFactor, `${s.readSpeed.toLocaleString()} MB/s`]
    case 'psu':
      return [`${s.watts}W`, s.efficiency, s.formFactor, `${s.modular} modular`]
    case 'case':
      return [s.formFactors.map(f => f === 'Micro-ATX' ? 'mATX' : f === 'Mini-ITX' ? 'ITX' : f).join('/'), `GPU ≤ ${s.maxGpuLength}mm`, `Cooler ≤ ${s.maxCoolerHeight}mm`, s.sidePanel]
    case 'cooler':
      return [s.type, s.radiatorSize ? `${s.radiatorSize}mm rad` : `${s.height}mm tall`, `${s.tdpRating}W rated`, `${s.sockets.length} sockets`]
  }
}

/** Full spec table rows for the details modal. */
export function specTable(p: Product): Array<[string, string]> {
  const s = p.specs
  switch (s.kind) {
    case 'cpu':
      return [
        ['Socket', s.socket], ['Cores / Threads', `${s.cores} / ${s.threads}`],
        ['Base / Boost clock', `${s.baseClock} / ${s.boostClock} GHz`],
        ['TDP', `${s.tdp} W`], ['Memory support', s.memoryTypes.join(' / ')],
      ]
    case 'gpu':
      return [
        ['VRAM', `${s.vram} GB`], ['Card length', `${s.length} mm`],
        ['TDP', `${s.tdp} W`], ['Ray tracing', s.rayTracing ? 'Yes' : 'No'],
      ]
    case 'motherboard':
      return [
        ['Socket', s.socket], ['Form factor', s.formFactor], ['Memory', s.memoryType],
        ['M.2 slots', String(s.m2Slots)], ['WiFi', s.wifi ? 'Yes' : 'No'], ['Max memory', `${s.maxMemory} GB`],
      ]
    case 'ram':
      return [
        ['Type', s.type], ['Capacity', `${s.capacity} GB kit`], ['Speed', `${s.speed} MT/s`],
        ['Modules', String(s.modules)], ['CAS latency', `CL${s.casLatency}`],
      ]
    case 'storage':
      return [
        ['Interface', s.interface], ['Capacity', s.capacity >= 1000 ? `${s.capacity / 1000} TB` : `${s.capacity} GB`],
        ['Form factor', s.formFactor], ['Sequential read', `${s.readSpeed.toLocaleString()} MB/s`],
      ]
    case 'psu':
      return [
        ['Wattage', `${s.watts} W`], ['Efficiency', s.efficiency],
        ['Form factor', s.formFactor], ['Modularity', `${s.modular} modular`],
      ]
    case 'case':
      return [
        ['Motherboard support', s.formFactors.join(', ')], ['Max GPU length', `${s.maxGpuLength} mm`],
        ['Max cooler height', `${s.maxCoolerHeight} mm`], ['PSU support', s.psuFormFactors.join(', ')],
        ['Side panel', s.sidePanel],
      ]
    case 'cooler':
      return [
        ['Type', s.type], ['Height', s.height ? `${s.height} mm` : '—'],
        ['Radiator', s.radiatorSize ? `${s.radiatorSize} mm` : '—'],
        ['Socket support', s.sockets.join(', ')], ['Heat load rating', `${s.tdpRating} W`],
      ]
  }
}

/** Numeric quality index used for sorting "performance" per category. */
export function perfIndex(p: Product): number {
  const s = p.specs
  switch (s.kind) {
    case 'cpu': return s.gamingIndex * 0.6 + s.multicoreIndex * 0.4
    case 'gpu': return s.gamingIndex
    case 'ram': return s.capacity * 2 + s.speed / 200
    case 'storage': return s.readSpeed / 100 + s.capacity / 250
    case 'psu': return s.watts
    case 'motherboard': return s.m2Slots * 10 + (s.wifi ? 8 : 0) + (s.formFactor === 'ATX' ? 6 : s.formFactor === 'Micro-ATX' ? 3 : 0)
    case 'case': return s.maxGpuLength / 10 + s.maxCoolerHeight / 10
    case 'cooler': return s.tdpRating
  }
}
