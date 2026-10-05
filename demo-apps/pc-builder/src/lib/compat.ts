import type { Build, CompatIssue, Product, CategoryId } from '../types'
import { byId } from '../data/catalog'
import { estimateWattage, recommendedPsu } from './power'

/**
 * Compatibility engine. Every rule reads the current build (with optional
 * candidate override) and returns issues with severity + explanation.
 */
export function checkBuild(build: Build, override?: { category: CategoryId; productId: string | string[] }): CompatIssue[] {
  const issues: CompatIssue[] = []
  const get = (id: string | null): Product | undefined => (id ? byId.get(id) : undefined)

  // Candidate substitution for "what if I pick this" previews
  let b = build
  if (override) {
    if (override.category === 'storage') {
      b = { ...build, storage: [...(override.productId as string[])] }
    } else {
      b = { ...build, [override.category]: override.productId as string }
    }
  }

  const cpu = get(b.cpu)
  const mb = get(b.motherboard)
  const ram = get(b.ram)
  const gpu = get(b.gpu)
  const psu = get(b.psu)
  const pcCase = get(b.case)
  const cooler = get(b.cooler)

  const cpuSpec = cpu?.specs.kind === 'cpu' ? cpu.specs : null
  const mbSpec = mb?.specs.kind === 'motherboard' ? mb.specs : null
  const ramSpec = ram?.specs.kind === 'ram' ? ram.specs : null
  const gpuSpec = gpu?.specs.kind === 'gpu' ? gpu.specs : null
  const psuSpec = psu?.specs.kind === 'psu' ? psu.specs : null
  const caseSpec = pcCase?.specs.kind === 'case' ? pcCase.specs : null
  const coolSpec = cooler?.specs.kind === 'cooler' ? cooler.specs : null

  // 1. CPU <-> Motherboard socket
  if (cpuSpec && mbSpec && cpuSpec.socket !== mbSpec.socket) {
    issues.push({
      id: 'socket-mismatch', severity: 'error',
      title: `Socket mismatch: ${cpuSpec.socket} vs ${mbSpec.socket}`,
      detail: `${cpu!.name} uses socket ${cpuSpec.socket}, but ${mb!.name} has an ${mbSpec.socket} socket. The CPU physically will not fit.`,
      categories: ['cpu', 'motherboard'],
    })
  }

  // 2. Motherboard <-> RAM type
  if (ramSpec && mbSpec && ramSpec.type !== mbSpec.memoryType) {
    issues.push({
      id: 'ram-mismatch', severity: 'error',
      title: `Memory type mismatch: ${ramSpec.type} vs ${mbSpec.memoryType}`,
      detail: `${mb!.name} takes ${mbSpec.memoryType} memory, but ${ram!.name} is ${ramSpec.type}. These slots are not interchangeable.`,
      categories: ['ram', 'motherboard'],
    })
  }

  // 2b. CPU memory support (informational)
  if (cpuSpec && ramSpec && !cpuSpec.memoryTypes.includes(ramSpec.type)) {
    issues.push({
      id: 'cpu-mem-type', severity: 'error',
      title: `CPU does not support ${ramSpec.type}`,
      detail: `${cpu!.name} supports ${cpuSpec.memoryTypes.join('/')} only.`,
      categories: ['cpu', 'ram'],
    })
  }

  // 3. GPU length <-> case clearance
  if (gpuSpec && caseSpec) {
    if (gpuSpec.length > caseSpec.maxGpuLength) {
      issues.push({
        id: 'gpu-too-long', severity: 'error',
        title: `GPU too long for case (${gpuSpec.length}mm > ${caseSpec.maxGpuLength}mm)`,
        detail: `${gpu!.name} is ${gpuSpec.length}mm long; ${pcCase!.name} fits cards up to ${caseSpec.maxGpuLength}mm. It will not close.`,
        categories: ['gpu', 'case'],
      })
    } else if (caseSpec.maxGpuLength - gpuSpec.length < 15) {
      issues.push({
        id: 'gpu-tight', severity: 'warning',
        title: `GPU clearance is tight (${caseSpec.maxGpuLength - gpuSpec.length}mm spare)`,
        detail: `Fits, but cable routing past the end of the card may be difficult.`,
        categories: ['gpu', 'case'],
      })
    }
  }

  // 4. Cooler <-> CPU socket support
  if (coolSpec && cpuSpec && !coolSpec.sockets.includes(cpuSpec.socket)) {
    issues.push({
      id: 'cooler-socket', severity: 'error',
      title: `Cooler does not support ${cpuSpec.socket}`,
      detail: `${cooler!.name} supports ${coolSpec.sockets.join('/')} — no mounting kit for your ${cpuSpec.socket} CPU.`,
      categories: ['cooler', 'cpu'],
    })
  }

  // 5. Cooler height (air) <-> case clearance
  if (coolSpec && caseSpec && coolSpec.type === 'Air' && coolSpec.height) {
    if (coolSpec.height > caseSpec.maxCoolerHeight) {
      issues.push({
        id: 'cooler-height', severity: 'error',
        title: `Cooler too tall for case (${coolSpec.height}mm > ${caseSpec.maxCoolerHeight}mm)`,
        detail: `${cooler!.name} is ${coolSpec.height}mm tall; ${pcCase!.name} clears ${caseSpec.maxCoolerHeight}mm. The side panel will not fit.`,
        categories: ['cooler', 'case'],
      })
    } else if (caseSpec.maxCoolerHeight - coolSpec.height < 10) {
      issues.push({
        id: 'cooler-tight', severity: 'warning',
        title: `Cooler clearance is tight (${caseSpec.maxCoolerHeight - coolSpec.height}mm spare)`,
        detail: 'Fits, but with little margin — check fan positions.',
        categories: ['cooler', 'case'],
      })
    }
  }

  // 5b. Cooler TDP adequacy
  if (coolSpec && cpuSpec && coolSpec.tdpRating < cpuSpec.tdp) {
    issues.push({
      id: 'cooler-tdp', severity: 'warning',
      title: `Cooler is underrated for the CPU (${coolSpec.tdpRating}W < ${cpuSpec.tdp}W)`,
      detail: `${cooler!.name} is rated for ~${coolSpec.tdpRating}W; ${cpu!.name} draws up to ${cpuSpec.tdp}W. Expect high temperatures and thermal throttling under load.`,
      categories: ['cooler', 'cpu'],
    })
  }

  // 6. Motherboard form factor <-> case support
  if (mbSpec && caseSpec && !caseSpec.formFactors.includes(mbSpec.formFactor)) {
    issues.push({
      id: 'formfactor', severity: 'error',
      title: `Case does not fit ${mbSpec.formFactor} motherboards`,
      detail: `${pcCase!.name} supports ${caseSpec.formFactors.join(', ')} boards — ${mb!.name} is ${mbSpec.formFactor}.`,
      categories: ['motherboard', 'case'],
    })
  }

  // 7. PSU form factor <-> case support
  if (psuSpec && caseSpec && !caseSpec.psuFormFactors.includes(psuSpec.formFactor)) {
    issues.push({
      id: 'psu-ff', severity: 'error',
      title: `Case takes ${caseSpec.psuFormFactors.join('/')} power supplies`,
      detail: `${pcCase!.name} mounts ${caseSpec.psuFormFactors.join('/')} PSUs — ${psu!.name} is ${psuSpec.formFactor}.`,
      categories: ['psu', 'case'],
    })
  }

  // 8. PSU wattage <-> estimated draw
  if (psuSpec && (cpuSpec || gpuSpec)) {
    const { total } = estimateWattage(b)
    const rec = recommendedPsu(total)
    if (psuSpec.watts < total) {
      issues.push({
        id: 'psu-weak', severity: 'error',
        title: `PSU below estimated draw (${psuSpec.watts}W < ~${total}W)`,
        detail: `Your parts estimate ~${total}W. A ${psuSpec.watts}W unit risks shutdowns under load — aim for ${rec}W.`,
        categories: ['psu'],
      })
    } else if (psuSpec.watts < total * 1.2) {
      issues.push({
        id: 'psu-tight', severity: 'warning',
        title: `PSU headroom is thin (${psuSpec.watts}W for ~${total}W draw)`,
        detail: `Works, but little room for power spikes or upgrades. ${rec}W recommended.`,
        categories: ['psu'],
      })
    } else {
      issues.push({
        id: 'psu-ok', severity: 'info',
        title: `PSU headroom healthy (${psuSpec.watts}W for ~${total}W draw)`,
        detail: `Estimated draw is ~${Math.round((total / psuSpec.watts) * 100)}% of rated capacity at full load.`,
        categories: ['psu'],
      })
    }
  }

  // 9. M.2 slot budget
  if (mbSpec) {
    const m2Drives = b.storage.filter(id => {
      const d = byId.get(id)
      return d?.specs.kind === 'storage' && d.specs.formFactor === 'M.2'
    }).length
    if (m2Drives > mbSpec.m2Slots) {
      issues.push({
        id: 'm2-slots', severity: 'warning',
        title: `${m2Drives} M.2 drives but ${mbSpec.m2Slots} M.2 slots`,
        detail: `${mb!.name} has ${mbSpec.m2Slots} M.2 slots — you will need a PCIe adapter or a SATA drive for the rest.`,
        categories: ['storage', 'motherboard'],
      })
    }
  }

  // 10. RAM capacity sanity
  if (ramSpec && ramSpec.capacity < 16) {
    issues.push({
      id: 'ram-small', severity: 'warning',
      title: 'Under 16GB of RAM',
      detail: 'Modern games and multitasking will feel constrained — 16GB is the practical minimum, 32GB recommended.',
      categories: ['ram'],
    })
  }

  // 11. Missing essential parts (informational, shown when partially built)
  const essential: Array<[CategoryId, boolean]> = [
    ['cpu', !!b.cpu], ['motherboard', !!b.motherboard], ['ram', !!b.ram],
    ['gpu', !!b.gpu], ['storage', b.storage.length > 0], ['psu', !!b.psu],
    ['case', !!b.case], ['cooler', !!b.cooler],
  ]
  const missing = essential.filter(([, has]) => !has).map(([id]) => id)
  if (missing.length > 0 && missing.length < 8) {
    issues.push({
      id: 'missing-parts', severity: 'info',
      title: `${missing.length} part${missing.length > 1 ? 's' : ''} still missing`,
      detail: `Not selected yet: ${missing.join(', ')}.`,
      categories: missing,
    })
  }

  return issues
}

/** Quick boolean: would `product` conflict with the current build? */
export function candidateIssues(build: Build, product: Product): CompatIssue[] {
  if (product.category === 'storage') {
    const next = [...build.storage, product.id]
    return checkBuild(build, { category: 'storage', productId: next })
      .filter(i => i.severity === 'error' && i.id !== 'missing-parts')
  }
  return checkBuild(build, { category: product.category, productId: product.id })
    .filter(i => i.severity === 'error' && i.id !== 'missing-parts')
}

export function worstSeverity(issues: CompatIssue[]): 'error' | 'warning' | 'info' | 'none' {
  if (issues.some(i => i.severity === 'error')) return 'error'
  if (issues.some(i => i.severity === 'warning')) return 'warning'
  if (issues.length > 0) return 'info'
  return 'none'
}
