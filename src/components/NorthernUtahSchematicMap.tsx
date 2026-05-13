import type { RinkEntry } from '../rinkData'
import { RINK_COLORS, northernUtahProject, rinkSlug } from '../rinkData'

const VB_W = 400
const VB_H = 220

type Props = {
  rinks: readonly RinkEntry[]
}

/**
 * Stylized northern Utah schematic (SVG only — no map SDK).
 * Pin positions come from real lat/lng projected into the viewBox.
 */
export function NorthernUtahSchematicMap({ rinks }: Props) {
  const labels = rinks.map((r) => r.abbrev).join(', ')

  return (
    <figure className="northern-utah-map" aria-label={`Rink locations schematic: ${labels}`}>
      <figcaption className="northern-utah-map__caption">Schematic — not to scale</figcaption>
      <svg
        className="northern-utah-map__svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        role="img"
      >
        <defs>
          <linearGradient id="northern-utah-sky" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(15, 23, 42, 0.95)" />
            <stop offset="100%" stopColor="rgba(30, 41, 59, 0.88)" />
          </linearGradient>
          <linearGradient id="northern-utah-lake" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.14)" />
            <stop offset="100%" stopColor="rgba(30, 58, 138, 0.22)" />
          </linearGradient>
          <filter id="northern-utah-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={VB_W} height={VB_H} rx="14" fill="url(#northern-utah-sky)" stroke="rgba(148,163,184,0.2)" />

        {/* Great Salt Lake — abstract */}
        <ellipse cx="118" cy="118" rx="72" ry="58" fill="url(#northern-utah-lake)" stroke="rgba(125,211,252,0.12)" />
        <ellipse cx="132" cy="108" rx="38" ry="30" fill="rgba(15,23,42,0.25)" />

        {/* Wasatch-ish ridgeline */}
        <path
          d="M 318 28 Q 332 90 326 155 Q 322 198 314 212"
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth="2"
          strokeDasharray="5 6"
        />

        {/* Area labels (decorative) */}
        <text x="52" y="36" fill="rgba(148,163,184,0.55)" fontSize="11" fontWeight="700" fontFamily="inherit">
          Ogden
        </text>
        <text x="168" y="52" fill="rgba(148,163,184,0.5)" fontSize="11" fontWeight="700" fontFamily="inherit">
          Salt Lake
        </text>
        <text x="268" y="198" fill="rgba(148,163,184,0.5)" fontSize="11" fontWeight="700" fontFamily="inherit">
          Utah Valley
        </text>

        {rinks.map((r) => {
          const { x, y } = northernUtahProject(r.lat, r.lng, VB_W, VB_H)
          const fill = RINK_COLORS[r.id] ?? '#818cf8'
          const hash = rinkSlug(r.id)
          return (
            <a
              key={r.id}
              href={`#rink-card-${hash}`}
              className="northern-utah-map__pin-hit"
              aria-label={`${r.id} — jump to details`}
            >
              <g transform={`translate(${x}, ${y})`} filter="url(#northern-utah-glow)">
                <title>{`${r.id} · ${r.city}`}</title>
                <circle r="20" fill="transparent" />
                <circle r="14" fill="rgba(7,11,17,0.55)" stroke="rgba(248,250,252,0.35)" strokeWidth="1" />
                <circle r="7" fill={fill} stroke="rgba(248,250,252,0.9)" strokeWidth="1.5" />
              </g>
            </a>
          )
        })}
      </svg>
    </figure>
  )
}
