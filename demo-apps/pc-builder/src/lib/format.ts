export function money(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function tier(score: number): string {
  if (score >= 90) return 'Enthusiast'
  if (score >= 75) return 'High-end'
  if (score >= 60) return 'Mainstream'
  if (score >= 45) return 'Entry-level'
  return 'Basic'
}
