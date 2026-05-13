export const RINK_COLORS: Record<string, string> = {
  'Ice Sheet': '#3b82f6',
  'Acord Ice Center': '#06b6d4',
  'County Ice Center': '#10b981',
  'Peaks Ice Arena': '#eab308',
  Steiner: '#f97316',
}

/** Northern Utah bounds for schematic map placement (not survey-grade). */
const MAP_LAT_N = 41.42
const MAP_LAT_S = 40.22
const MAP_LNG_W = -112.05
const MAP_LNG_E = -111.48

export type RinkEntry = {
  id: string
  abbrev: string
  city: string
  /** WGS84 — used only to place the dot on the in-app schematic map. */
  lat: number
  lng: number
  officialUrl: string
  blurb: string
}

export const RINK_REGISTRY = [
  {
    id: 'Ice Sheet',
    abbrev: 'Ice Sheet',
    city: 'Ogden area',
    lat: 41.303,
    lng: -111.979,
    officialUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
    blurb: 'Weber County Ice Sheet — calendar feeds appear on Salty Puck when live.',
  },
  {
    id: 'Acord Ice Center',
    abbrev: 'Acord',
    city: 'West Valley City',
    lat: 40.691,
    lng: -111.939,
    officialUrl: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
    blurb: 'Monthly PDF via QuickScores — confirm sheet times on the official message before you travel.',
  },
  {
    id: 'County Ice Center',
    abbrev: 'County',
    city: 'Salt Lake City',
    lat: 40.771,
    lng: -111.906,
    officialUrl: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
    blurb: 'County facility — same QuickScores discovery flow as Acord.',
  },
  {
    id: 'Peaks Ice Arena',
    abbrev: 'Peaks',
    city: 'Provo',
    lat: 40.245,
    lng: -111.659,
    officialUrl: 'https://www.provo.gov/394/Peaks-Ice-Arena',
    blurb: 'Provo Peaks — public Google Calendar blocks; some programs use separate registration.',
  },
  {
    id: 'Steiner',
    abbrev: 'Steiner',
    city: 'Salt Lake County (West Valley)',
    lat: 40.699,
    lng: -111.974,
    officialUrl:
      'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/slc-sports-complex-ice/#activities',
    blurb: 'SLC Sports Complex ice — county Amilia schedule mirrored here when the API responds.',
  },
] as const satisfies readonly RinkEntry[]

export function rinkSlug(id: string): string {
  return id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Project WGS84 into schematic SVG coordinates (viewBox width / height). */
export function northernUtahProject(
  lat: number,
  lng: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const x = ((lng - MAP_LNG_W) / (MAP_LNG_E - MAP_LNG_W)) * viewW
  const y = ((MAP_LAT_N - lat) / (MAP_LAT_N - MAP_LAT_S)) * viewH
  const pad = 14
  return {
    x: Math.min(viewW - pad, Math.max(pad, x)),
    y: Math.min(viewH - pad, Math.max(pad, y)),
  }
}
