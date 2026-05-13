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

/** Venue photo stored under `/public` with Wikimedia Commons attribution. */
export type RinkPhoto = {
  src: string
  alt: string
  author: string
  licenseShort: string
  licenseUrl: string
  /** Commons file page — human-readable source. */
  sourceUrl: string
}

/**
 * Exterior / identifiable venue shots only (no unrelated stock).
 * Wikimedia Commons did not surface clear CC-licensed photos for the other Salt Lake County–area rinks yet.
 */
export const RINK_PHOTOS: Partial<Record<string, RinkPhoto>> = {
  'Utah Olympic Oval': {
    src: '/rinks/utah-olympic-oval.jpg',
    alt: 'Utah Olympic Oval building exterior in Kearns, Utah',
    author: 'Ken Lund',
    licenseShort: 'CC BY-SA 2.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Utah_Olympic_Oval.jpg',
  },
  'Peaks Ice Arena': {
    src: '/rinks/peaks-ice-arena.jpg',
    alt: 'Peaks Ice Arena exterior in Provo, Utah',
    author: 'An Errant Knight',
    licenseShort: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Peaks_Ice_Arena,_Feb_17.jpg',
  },
  'Ice Sheet': {
    src: '/rinks/ice-sheet-ogden.jpg',
    alt: 'Weber County Ice Sheet building exterior in Ogden, Utah',
    author: 'Mandysc89',
    licenseShort: 'CC0 1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:The_Ice_Sheet_at_Ogden.jpg',
  },
}

export function rinkPhotoFor(id: string): RinkPhoto | undefined {
  return RINK_PHOTOS[id]
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
      'Olympic speed skating venue with public sessions and hockey programming — optional ICS env supported.',
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
