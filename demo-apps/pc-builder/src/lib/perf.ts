import type { Build } from '../types'
import { byId } from '../data/catalog'
import { clamp, tier } from './format'

export interface PerformanceReport {
  gaming: { score: number; fps1080: number; fps1440: number; fps4k: number; tier: string; note: string } | null
  productivity: { score: number; tier: string; note: string } | null
  ai: { score: number; tier: string; llm: string; note: string } | null
}

/**
 * Rough relative performance predictions derived from catalog indices.
 * Clearly estimates — meant for build comparison, not benchmarks.
 */
export function estimatePerformance(build: Build): PerformanceReport {
  const cpu = build.cpu ? byId.get(build.cpu) : null
  const gpu = build.gpu ? byId.get(build.gpu) : null
  const ram = build.ram ? byId.get(build.ram) : null

  const cpuSpec = cpu?.specs.kind === 'cpu' ? cpu.specs : null
  const gpuSpec = gpu?.specs.kind === 'gpu' ? gpu.specs : null
  const ramSpec = ram?.specs.kind === 'ram' ? ram.specs : null
  const ramGB = ramSpec?.capacity ?? 0

  let gaming = null
  if (gpuSpec && cpuSpec) {
    let score = 0.78 * gpuSpec.gamingIndex + 0.22 * cpuSpec.gamingIndex
    let note = 'Balanced pairing'
    if (ramGB > 0 && ramGB < 16) { score *= 0.88; note = 'Below 16GB RAM caps smoothness' }
    else if (gpuSpec.gamingIndex - cpuSpec.gamingIndex > 22) { note = 'CPU may bottleneck this GPU' }
    else if (cpuSpec.gamingIndex - gpuSpec.gamingIndex > 25) { note = 'GPU is the limiting factor' }
    score = Math.round(clamp(score, 5, 100))
    gaming = {
      score,
      fps1080: Math.round(score * 2.3),
      fps1440: Math.round(score * 1.65),
      fps4k: Math.round(score * 0.9),
      tier: tier(score),
      note,
    }
  }

  let productivity = null
  if (cpuSpec) {
    const ramFactor = ramGB > 0 ? clamp(ramGB * 2.1, 20, 100) : 45
    const score = Math.round(clamp(0.72 * cpuSpec.multicoreIndex + 0.28 * ramFactor, 5, 100))
    let note = 'Good for coding & media work'
    if (cpuSpec.multicoreIndex >= 90) note = 'Excellent for rendering, VMs & compile-heavy work'
    else if (cpuSpec.multicoreIndex < 55) note = 'Light productivity workloads'
    if (ramGB > 0 && ramGB < 16) note += ' · consider 32GB for heavy apps'
    productivity = { score, tier: tier(score), note }
  }

  let ai = null
  if (gpuSpec) {
    const vramFactor = clamp(gpuSpec.vram * 4, 20, 100)
    const score = Math.round(clamp(0.8 * gpuSpec.aiIndex + 0.2 * vramFactor, 5, 100))
    let llm = 'Not suitable for local LLMs'
    if (gpuSpec.vram >= 24) llm = 'Local LLMs up to ~70B (quantized)'
    else if (gpuSpec.vram >= 16) llm = 'Local LLMs up to ~33B (quantized)'
    else if (gpuSpec.vram >= 12) llm = 'Local LLMs up to ~13B'
    else if (gpuSpec.vram >= 8) llm = 'Local LLMs up to ~7B (quantized)'
    let note = 'Stable Diffusion & model fine-tuning'
    if (gpuSpec.aiIndex < 50) note = 'Entry AI inference — smaller models only'
    else if (gpuSpec.aiIndex >= 90) note = 'Serious local AI training / inference'
    ai = { score, tier: tier(score), llm, note }
  }

  return { gaming, productivity, ai }
}
