// ---------- Core domain types ----------

export type CategoryId =
  | 'cpu'
  | 'motherboard'
  | 'ram'
  | 'gpu'
  | 'storage'
  | 'psu'
  | 'case'
  | 'cooler'

export type Socket = 'AM4' | 'AM5' | 'LGA1700'
export type MemoryType = 'DDR4' | 'DDR5'
export type FormFactor = 'ATX' | 'Micro-ATX' | 'Mini-ITX'
export type PsuFormFactor = 'ATX' | 'SFX'

export interface CpuSpec {
  socket: Socket
  cores: number
  threads: number
  baseClock: number
  boostClock: number
  tdp: number
  memoryTypes: MemoryType[]
  gamingIndex: number   // 0-100 relative gaming capability
  multicoreIndex: number // 0-100 relative multithread capability
}

export interface GpuSpec {
  vram: number          // GB
  length: number        // mm
  tdp: number
  gamingIndex: number   // 0-100
  aiIndex: number       // 0-100
  rayTracing: boolean
}

export interface MotherboardSpec {
  socket: Socket
  formFactor: FormFactor
  memoryType: MemoryType
  m2Slots: number
  wifi: boolean
  maxMemory: number // GB
}

export interface RamSpec {
  type: MemoryType
  capacity: number   // GB total kit
  speed: number      // MHz
  modules: number
  casLatency: number
}

export interface StorageSpec {
  interface: 'NVMe Gen4' | 'NVMe Gen3' | 'SATA SSD' | 'HDD'
  capacity: number   // GB
  formFactor: 'M.2' | '2.5"' | '3.5"'
  readSpeed: number  // MB/s
}

export interface PsuSpec {
  watts: number
  efficiency: string
  formFactor: PsuFormFactor
  modular: 'Full' | 'Semi' | 'None'
}

export interface CaseSpec {
  formFactors: FormFactor[]
  maxGpuLength: number    // mm
  maxCoolerHeight: number // mm
  psuFormFactors: PsuFormFactor[]
  sidePanel: string
}

export interface CoolerSpec {
  type: 'Air' | 'Liquid'
  height: number | null       // mm for air coolers
  radiatorSize: number | null // mm for AIOs
  sockets: Socket[]
  tdpRating: number
}

export type Specs =
  | ({ kind: 'cpu' } & CpuSpec)
  | ({ kind: 'gpu' } & GpuSpec)
  | ({ kind: 'motherboard' } & MotherboardSpec)
  | ({ kind: 'ram' } & RamSpec)
  | ({ kind: 'storage' } & StorageSpec)
  | ({ kind: 'psu' } & PsuSpec)
  | ({ kind: 'case' } & CaseSpec)
  | ({ kind: 'cooler' } & CoolerSpec)

export interface Product {
  id: string
  category: CategoryId
  name: string
  brand: string
  price: number
  specs: Specs
}

export interface Build {
  cpu: string | null
  motherboard: string | null
  ram: string | null
  gpu: string | null
  storage: string[]       // multiple drives allowed
  psu: string | null
  case: string | null
  cooler: string | null
}

export type Severity = 'error' | 'warning' | 'info'

export interface CompatIssue {
  id: string
  severity: Severity
  title: string
  detail: string
  categories: CategoryId[]
}

export interface WattBreakdown {
  label: string
  watts: number
}

export interface PerfEstimate {
  score: number
  title: string
  lines: string[]
}

export interface Toast {
  id: number
  message: string
  kind: 'ok' | 'err' | 'info'
}
