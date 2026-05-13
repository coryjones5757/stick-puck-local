export const RINK_COLORS: Record<string, string> = {
  'Ice Sheet': '#3b82f6',
  'Acord Ice Center': '#06b6d4',
  'County Ice Center': '#10b981',
  'Peaks Ice Arena': '#eab308',
  Steiner: '#f97316',
}

export type RinkEntry = {
  id: string
  abbrev: string
  city: string
  /** Single-line mailing address for display and maps. */
  address: string
  /** Lobby or main line; shown as-is. Omit digits to hide the Call action. */
  phone?: string
  /** WGS84 — map markers and directions. */
  lat: number
  lng: number
  officialUrl: string
  blurb: string
}

export const RINK_REGISTRY = [
  {
    id: 'Ice Sheet',
    abbrev: 'Ice Sheet',
    city: 'Ogden',
    address: '4390 Harrison Blvd, Ogden, UT 84403',
    phone: '(801) 778-6360',
    lat: 41.2178,
    lng: -111.9867,
    officialUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
    blurb: 'Weber County Ice Sheet — calendar feeds appear on Salty Puck when live.',
  },
  {
    id: 'Acord Ice Center',
    abbrev: 'Acord',
    city: 'West Valley City',
    address: '5353 W 3100 S, West Valley City, UT 84120',
    phone: '(385) 468-1970',
    lat: 40.7008,
    lng: -112.0248,
    officialUrl: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
    blurb: 'Monthly PDF via QuickScores — confirm sheet times on the official message before you travel.',
  },
  {
    id: 'County Ice Center',
    abbrev: 'County',
    city: 'Murray',
    address: '5201 S Murray Park Ln, Murray, UT 84107',
    phone: '(385) 468-1650',
    lat: 40.6738,
    lng: -111.8796,
    officialUrl: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
    blurb: 'County facility — same QuickScores discovery flow as Acord.',
  },
  {
    id: 'Peaks Ice Arena',
    abbrev: 'Peaks',
    city: 'Provo',
    address: '100 N Seven Peaks Blvd, Provo, UT 84606',
    phone: '(801) 852-7465',
    lat: 40.245,
    lng: -111.659,
    officialUrl: 'https://www.provo.gov/394/Peaks-Ice-Arena',
    blurb: 'Provo Peaks — public Google Calendar blocks; some programs use separate registration.',
  },
  {
    id: 'Steiner',
    abbrev: 'Steiner',
    city: 'Salt Lake City',
    address: '645 S Guardsman Way, Salt Lake City, UT 84108',
    phone: '(385) 468-1925',
    lat: 40.7524,
    lng: -111.9384,
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

/** Build tel: href from a human-readable US phone string; returns null if no digits. */
export function telHref(displayPhone: string | undefined): string | null {
  if (!displayPhone?.trim()) return null
  const digits = displayPhone.replace(/\D/g, '')
  if (digits.length === 10) return `tel:+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `tel:+${digits}`
  return digits.length > 0 ? `tel:+${digits}` : null
}

export function googleDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}
