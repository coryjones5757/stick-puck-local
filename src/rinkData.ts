export const RINK_COLORS: Record<string, string> = {
  'Ice Sheet': '#3b82f6',
  'Acord Ice Center': '#06b6d4',
  'County Ice Center': '#10b981',
  'Peaks Ice Arena': '#eab308',
  'SLC Sports Complex': '#f97316',
  'Park City Ice Arena': '#ec4899',
  'Utah Olympic Oval': '#14b8a6',
  'Eccles Ice Center': '#a855f7',
  'Utah Mammoth Ice Center': '#ef4444',
  'Cottonwood Heights Ice Arena': '#84cc16',
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

/** Venue photo stored under `/public` — Commons attribution or venue-supplied image. */
export type RinkPhoto = {
  src: string
  alt: string
  author: string
  licenseShort: string
  /** Omit for venue-supplied photos (credit line shows license text only). */
  licenseUrl?: string
  /** Photo context link (Commons file page or official venue URL). */
  sourceUrl: string
}

/**
 * Exterior / identifiable venue shots only (no unrelated stock).
 * Mix of Wikimedia Commons and venue-supplied images in `/public/rinks/`.
 */
export const RINK_PHOTOS: Partial<Record<string, RinkPhoto>> = {
  'Acord Ice Center': {
    src: '/rinks/acord-ice-center.png',
    alt: 'Acord Ice Center exterior, West Valley City, Utah',
    author: 'Salt Lake County',
    licenseShort: 'Venue photo',
    sourceUrl:
      'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/acord-ice-center/',
  },
  'Cottonwood Heights Ice Arena': {
    src: '/rinks/cottonwood-heights-ice-arena.png',
    alt: 'Cottonwood Heights Ice Arena exterior, Utah',
    author: 'Cottonwood Heights Parks & Recreation',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://www.chparksandrecut.gov/ice-arena',
  },
  'County Ice Center': {
    src: '/rinks/county-ice-center.png',
    alt: 'County Ice Center exterior, Murray, Utah',
    author: 'Salt Lake County',
    licenseShort: 'Venue photo',
    sourceUrl:
      'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/county-ice-center/',
  },
  'Eccles Ice Center': {
    src: '/rinks/eccles-ice-center.png',
    alt: 'George S. Eccles Ice Center exterior, Logan, Utah',
    author: 'Eccles Ice Center',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://www.ecclesice.com/',
  },
  'Ice Sheet': {
    src: '/rinks/weber-county-ice-sheet.png',
    alt: 'Weber County Ice Sheet main entrance at dusk, Ogden, Utah',
    author: 'Weber County',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
  },
  'Park City Ice Arena': {
    src: '/rinks/park-city-ice-arena.png',
    alt: 'Park City Ice Arena exterior, Park City, Utah',
    author: 'Park City Municipal',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://www.parkcity.org/departments/recreation/park-city-ice-arena',
  },
  'Peaks Ice Arena': {
    src: '/rinks/peaks-ice-arena.png',
    alt: 'Peaks Ice Arena exterior in Provo, Utah',
    author: 'City of Provo',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://www.provo.gov/394/Peaks-Ice-Arena',
  },
  'SLC Sports Complex': {
    src: '/rinks/slc-sports-complex.png',
    alt: 'SLC Sports Complex ice sheets exterior, Salt Lake City, Utah',
    author: 'Salt Lake County',
    licenseShort: 'Venue photo',
    sourceUrl:
      'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/slc-sports-complex-ice/#activities',
  },
  'Utah Mammoth Ice Center': {
    src: '/rinks/utah-mammoth-ice-center.png',
    alt: 'Utah Mammoth Ice Center, Sandy, Utah',
    author: 'Utah Mammoth Ice Center',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://www.mammothicecenter.com/',
  },
  'Utah Olympic Oval': {
    src: '/rinks/utah-olympic-oval.png',
    alt: 'Utah Olympic Oval exterior in Kearns, Utah',
    author: 'Utah Olympic Legacy Foundation',
    licenseShort: 'Venue photo',
    sourceUrl: 'https://utaholympiclegacy.org/oval/',
  },
}

export function rinkPhotoFor(id: string): RinkPhoto | undefined {
  return RINK_PHOTOS[id]
}

/** Two-letter label for rink thumbnails when no venue photo exists (schedule grid + directory cards). */
export function rinkThumbInitials(abbrev: string): string {
  const parts = abbrev
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? ''
    const b = parts[1]?.[0] ?? ''
    return (a + b).toUpperCase()
  }
  const w = parts[0] ?? '?'
  return w.slice(0, 2).toUpperCase()
}

export const RINK_REGISTRY = [
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
    id: 'Cottonwood Heights Ice Arena',
    abbrev: 'Cottonwood',
    city: 'Cottonwood Heights',
    address: '7500 S 2700 E, Cottonwood Heights, UT 84121',
    phone: '(801) 943-3190',
    lat: 40.6171,
    lng: -111.8094,
    officialUrl: 'https://www.chparksandrecut.gov/ice-arena',
    blurb:
      'CH Parks & recreation ice arena — on the map for filters; Salty Puck merges optional Google Calendar ICS when configured server-side.',
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
    id: 'Eccles Ice Center',
    abbrev: 'Eccles',
    city: 'Logan',
    address: '2825 N 200 E, Logan, UT 84341',
    phone: '(435) 787-2288',
    lat: 41.7736,
    lng: -111.8365,
    officialUrl: 'https://www.ecclesice.com/',
    blurb:
      'George S. Eccles Ice Center — listed here for northern Utah coverage; optional ICS calendar env supported.',
  },
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
    id: 'Park City Ice Arena',
    abbrev: 'Park City',
    city: 'Park City',
    address: '600 Gillmor Way, Park City, UT 84060',
    phone: '(435) 615-5707',
    lat: 40.7249,
    lng: -111.5264,
    officialUrl: 'https://www.parkcity.org/departments/recreation/park-city-ice-arena',
    blurb:
      'Municipal rink — DaySmart/DASH for much of the programming; optional Google Calendar ICS can be wired via deploy env.',
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
    id: 'SLC Sports Complex',
    abbrev: 'SLC SC',
    city: 'Salt Lake City',
    address: '645 S Guardsman Way, Salt Lake City, UT 84108',
    phone: '(385) 468-1925',
    lat: 40.7524,
    lng: -111.9384,
    officialUrl:
      'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/slc-sports-complex-ice/#activities',
    blurb: 'Former Steiner sheets — county Amilia JSON mirrored here when the proxy responds.',
  },
  {
    id: 'Utah Mammoth Ice Center',
    abbrev: 'Mammoth',
    city: 'Sandy',
    address: '10450 S State St Ste 2200A, Sandy, UT 84070',
    phone: '(801) 325-7000',
    lat: 40.5694,
    lng: -111.8916,
    officialUrl: 'https://www.mammothicecenter.com/',
    blurb:
      'Utah Mammoth Ice Center — public sessions and hockey ice via BondSports when live; optional ICS env when a calendar export exists.',
  },
  {
    id: 'Utah Olympic Oval',
    abbrev: 'Oval',
    city: 'Kearns',
    address: '5662 S Cougar Ln, Kearns, UT 84118',
    phone: '(801) 968-6825',
    lat: 40.6539,
    lng: -111.986,
    officialUrl: 'https://utaholympiclegacy.org/oval/',
    blurb:
      'Public skate times from the venue’s monthly PDF on utaholympiclegacy.org (auto-picked by month). This venue does not list stick & puck on that calendar — optional ICS env can still merge other public sessions only.',
  },
] as const satisfies readonly RinkEntry[]

/** Shown on the schedule Rinks grid for venues with an unusual program mix on merged feeds. */
export const RINK_VENUE_PROGRAM_HIGHLIGHTS: Partial<Record<string, string>> = {
  'Utah Olympic Oval': 'Public skate on this feed — no stick & puck on the Oval PDF',
}

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
