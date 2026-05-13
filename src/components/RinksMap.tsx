import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import Map, { Marker, NavigationControl } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import type { LngLatBoundsLike } from 'maplibre-gl'

import 'maplibre-gl/dist/maplibre-gl.css'

import type { RinkEntry } from '../rinkData'
import { RINK_COLORS, rinkSlug } from '../rinkData'

type Props = {
  rinks: readonly RinkEntry[]
}

/**
 * Carto Dark Matter (vector) — reads well on our navy UI. Optional override:
 * `VITE_MAP_STYLE_URL` = MapLibre style JSON (e.g. MapTiler Basic/Satellite with API key).
 */
const MAP_STYLE =
  typeof import.meta.env.VITE_MAP_STYLE_URL === 'string' && import.meta.env.VITE_MAP_STYLE_URL.trim().length > 0
    ? import.meta.env.VITE_MAP_STYLE_URL.trim()
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

function paddedBounds(rinks: readonly RinkEntry[]): LngLatBoundsLike {
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  for (const r of rinks) {
    minLat = Math.min(minLat, r.lat)
    maxLat = Math.max(maxLat, r.lat)
    minLng = Math.min(minLng, r.lng)
    maxLng = Math.max(maxLng, r.lng)
  }
  const latPad = Math.max(0.08, (maxLat - minLat) * 0.45)
  const lngPad = Math.max(0.1, (maxLng - minLng) * 0.45)
  return [
    [minLng - lngPad, minLat - latPad],
    [maxLng + lngPad, maxLat + latPad],
  ]
}

export default function RinksMap({ rinks }: Props) {
  const bounds = useMemo(() => paddedBounds(rinks), [rinks])

  return (
    <figure className="rinks-real-map-wrap">
      <figcaption className="rinks-real-map-wrap__caption">Map · © OpenStreetMap © CARTO</figcaption>
      <div className="rinks-real-map" role="application" aria-label="Utah hockey rinks locations">
        <Map
          mapLib={maplibregl}
          reuseMaps
          mapStyle={MAP_STYLE}
          style={{ width: '100%', height: '100%' }}
          initialViewState={{
            bounds,
            fitBoundsOptions: { padding: 44, maxZoom: 10 },
          }}
          attributionControl={false}
        >
          <NavigationControl position="top-right" showCompass={false} />
          {rinks.map((r) => {
            const color = RINK_COLORS[r.id] ?? '#818cf8'
            const hash = rinkSlug(r.id)
            const pinStyle = { '--rink-pin': color } as CSSProperties
            return (
              <Marker key={r.id} longitude={r.lng} latitude={r.lat} anchor="center">
                <a
                  href={`#rink-card-${hash}`}
                  className="rinks-real-map__pin"
                  aria-label={`${r.id}, ${r.city} — jump to details`}
                  title={r.id}
                  style={pinStyle}
                />
              </Marker>
            )
          })}
        </Map>
      </div>
    </figure>
  )
}
