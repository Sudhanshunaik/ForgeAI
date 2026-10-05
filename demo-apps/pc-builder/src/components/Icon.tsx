import type { CategoryId } from '../types'

interface IconProps {
  category: CategoryId
  className?: string
}

/** Original pictograms for each component category. */
export function CategoryIcon({ category, className = 'w-5 h-5' }: IconProps) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (category) {
    case 'cpu':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
        </svg>
      )
    case 'gpu':
      return (
        <svg {...common}>
          <path d="M2 8h18a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H2z" />
          <circle cx="7" cy="12" r="2.4" />
          <circle cx="14.5" cy="12" r="2.4" />
          <path d="M2 16v3" />
        </svg>
      )
    case 'motherboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <rect x="6.5" y="6.5" width="5" height="5" rx="1" />
          <path d="M15 7h3M15 9.5h3M15 12h3M6.5 14.5H12M6.5 17H12" />
          <circle cx="16.5" cy="16.5" r="1.6" />
        </svg>
      )
    case 'ram':
      return (
        <svg {...common}>
          <path d="M2 7h20v8H2z" />
          <path d="M6 7v8M10 7v8M14 7v8M18 7v8" opacity="0.55" />
          <path d="M5 15v3M9 15v3M13 15v3M17 15v3" />
        </svg>
      )
    case 'storage':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="7" rx="1.6" />
          <rect x="3" y="14" width="18" height="6" rx="1.6" />
          <path d="M7 7.5h.01M7 17h.01" strokeWidth="2.4" />
          <path d="M17 7.5h1.5M17 17h1.5" opacity="0.6" />
        </svg>
      )
    case 'psu':
      return (
        <svg {...common}>
          <rect x="2" y="8" width="20" height="10" rx="2" />
          <circle cx="9.5" cy="13" r="3" />
          <path d="M9.5 11.8v2.4M8.3 13h2.4" opacity="0.7" />
          <path d="M16 11h3M16 13.5h3M16 16h1.5" />
        </svg>
      )
    case 'case':
      return (
        <svg {...common}>
          <rect x="6" y="2.5" width="12" height="19" rx="2" />
          <path d="M9 6h6" />
          <circle cx="12" cy="10.5" r="2" />
          <path d="M9 16.5h6M9 19h3" opacity="0.7" />
        </svg>
      )
    case 'cooler':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 9c0-3.5 1-5.5 2.5-6.5C16 3.5 16.5 5 15 7.5" />
          <path d="M15 12c3.5 0 5.5 1 6.5 2.5-1 2.5-3 2-5.5.5" />
          <path d="M12 15c0 3.5-1 5.5-2.5 6.5C8 20.5 7.5 19 9 16.5" />
          <path d="M9 12c-3.5 0-5.5-1-6.5-2.5 1-2.5 3-2 5.5-.5" />
        </svg>
      )
  }
}

/** Small inline icons used across the dashboard. */
export function MiniIcon({ name, className = 'w-4 h-4' }: { name: 'bolt' | 'money' | 'check' | 'warn' | 'x' | 'info' | 'save' | 'share' | 'reset' | 'search' | 'close' | 'plus' | 'minus' | 'arrow' | 'spark' | 'chart' | 'game' | 'chip'; className?: string }) {
  const c = {
    className, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (name) {
    case 'bolt': return <svg {...c}><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>
    case 'money': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M12 6.5v11M15 9c-.6-1-1.7-1.5-3-1.5-1.8 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.2 2.2-3 2.2-1.3 0-2.4-.5-3-1.5" /></svg>
    case 'check': return <svg {...c}><path d="M4.5 12.5 10 18 19.5 6.5" /></svg>
    case 'warn': return <svg {...c}><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.5h.01" /></svg>
    case 'x': return <svg {...c}><path d="M6 6l12 12M18 6 6 18" /></svg>
    case 'info': return <svg {...c}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
    case 'save': return <svg {...c}><path d="M5 3.5h11l3 3V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" /><path d="M8 3.5V8h7V3.5M8 16.5h8" /></svg>
    case 'share': return <svg {...c}><circle cx="6" cy="12" r="2.5" /><circle cx="17.5" cy="5.5" r="2.5" /><circle cx="17.5" cy="18.5" r="2.5" /><path d="M8.2 10.8l7.1-4M8.2 13.2l7.1 4" /></svg>
    case 'reset': return <svg {...c}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4v5h5" /></svg>
    case 'search': return <svg {...c}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
    case 'close': return <svg {...c}><path d="M6 6l12 12M18 6 6 18" /></svg>
    case 'plus': return <svg {...c}><path d="M12 5v14M5 12h14" /></svg>
    case 'minus': return <svg {...c}><path d="M5 12h14" /></svg>
    case 'arrow': return <svg {...c}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    case 'spark': return <svg {...c}><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5L10 13l-6.5-2L10 9z" /></svg>
    case 'chart': return <svg {...c}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
    case 'game': return <svg {...c}><path d="M7 8h10a5 5 0 0 1 5 5v1a4 4 0 0 1-7 2.6L14 15h-4l-1 1.6A4 4 0 0 1 2 14v-1a5 5 0 0 1 5-5z" /><path d="M8.5 10.5v3M7 12h3M15.5 11h.01M17.5 13h.01" /></svg>
    case 'chip': return <svg {...c}><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M10 10h4v4h-4zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></svg>
  }
}
