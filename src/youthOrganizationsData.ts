/**
 * Curated UAHA-aligned youth hockey associations (text + outbound links only).
 * Source index: Utah Amateur Hockey “Member Organizations” page.
 */

export const UAHA_ORGANIZATIONS_URL = 'https://www.utah-hockey.com/organizations'

export type YouthOrgRegionId =
  | 'northeastern'
  | 'logan-area'
  | 'ogden-area'
  | 'davis-county'
  | 'salt-lake-metro'
  | 'kearns-oval'
  | 'utah-county'
  | 'park-city'
  | 'southern-utah'
  | 'statewide'

export type YouthOrgProgramTagId =
  | 'learn-to-play'
  | 'house'
  | 'travel'
  | 'tier-ii'
  | 'tier-i-elite'
  | 'girls'
  | 'high-school'

export type YouthOrganization = {
  id: string
  name: string
  regions: YouthOrgRegionId[]
  tags: YouthOrgProgramTagId[]
  /** Short geography line — summary of public UAHA copy, not a street address */
  localityLine: string
  /** Programs / levels summarized from UAHA listing text */
  programsLine: string
  /** Official program site when known; omit if none linked on UAHA directory */
  websiteUrl?: string
}

export const YOUTH_ORG_REGION_LABELS: Record<YouthOrgRegionId, string> = {
  northeastern: 'Uintah Basin (Vernal area)',
  'logan-area': 'Logan / Cache Valley',
  'ogden-area': 'Ogden / Northern Weber',
  'davis-county': 'Davis County',
  'salt-lake-metro': 'Salt Lake City area',
  'kearns-oval': 'Kearns (Utah Olympic Oval area)',
  'utah-county': 'Utah County (Provo area)',
  'park-city': 'Park City area',
  'southern-utah': 'Southern Utah',
  statewide: 'Statewide Utah',
}

export const YOUTH_ORG_TAG_LABELS: Record<YouthOrgProgramTagId, string> = {
  'learn-to-play': 'Learn to play',
  house: 'House / rec',
  travel: 'Travel A & B',
  'tier-ii': 'Tier II',
  'tier-i-elite': 'Tier I / elite travel',
  girls: 'Girls hockey',
  'high-school': 'High school',
}

/** UAHA-listed youth hockey associations (ordered north → south + statewide special cases). */
export const YOUTH_ORGANIZATIONS: readonly YouthOrganization[] = [
  {
    id: 'ashley-valley-hockey',
    name: 'Ashley Valley Hockey Association',
    regions: ['northeastern'],
    tags: ['learn-to-play', 'house', 'travel'],
    localityLine: 'Youth hockey based in Vernal, Utah.',
    programsLine:
      'Per UAHA listing: Learn to Play, House Rec, Travel B, Travel A.',
    websiteUrl: 'https://www.avaha.net/',
  },
  {
    id: 'cache-valley-jr-aggies',
    name: 'Cache Valley Jr Aggies',
    regions: ['logan-area'],
    tags: ['travel', 'girls'],
    localityLine: 'Youth and girls programs in Logan, Utah.',
    programsLine: 'Per UAHA listing: Travel A and Travel B.',
    websiteUrl: 'https://www.cachehockey.com/',
  },
  {
    id: 'davis-county-youth-hockey',
    name: 'Davis County Youth Hockey',
    regions: ['davis-county'],
    tags: ['house', 'travel', 'girls'],
    localityLine: 'Youth and girls hockey in Davis County, Utah.',
    programsLine: 'Per UAHA listing: House Rec, Travel B.',
    websiteUrl: 'https://davisyouthhockey.org/',
  },
  {
    id: 'ogden-jr-mustangs',
    name: 'Ogden Jr. Mustangs',
    regions: ['ogden-area'],
    tags: ['learn-to-play', 'house', 'travel', 'tier-ii', 'girls'],
    localityLine: 'Youth and girls hockey based in Ogden, Utah.',
    programsLine:
      'Per UAHA listing: Learn to Play, House Rec, Travel B, Travel A, Tier II.',
    websiteUrl: 'https://jrmustangshockey.com/',
  },
  {
    id: 'oval-dawgs-hockey',
    name: 'Oval Dawgs Hockey',
    regions: ['kearns-oval'],
    tags: ['learn-to-play', 'house', 'travel', 'tier-ii', 'girls'],
    localityLine: 'Youth and girls hockey linked to skating in Kearns, Utah.',
    programsLine:
      'Per UAHA listing: Learn to Play, House Rec, Travel B, Travel A, Tier II.',
    websiteUrl: 'https://utahovalhockey.hockeyshift.com/',
  },
  {
    id: 'park-city-ice-miners',
    name: 'Park City Ice Miners',
    regions: ['park-city'],
    tags: ['learn-to-play', 'house', 'travel', 'tier-ii'],
    localityLine: 'Youth hockey based in Park City, Utah.',
    programsLine:
      'Per UAHA listing: Learn to Play, House Rec, Travel B, Travel A, Tier II.',
    websiteUrl: 'https://www.pciceminers.org/',
  },
  {
    id: 'salt-lake-lightning',
    name: 'Salt Lake Lightning',
    regions: ['salt-lake-metro'],
    tags: ['learn-to-play', 'house', 'travel'],
    localityLine:
      'County youth Lightning program tied to Salt Lake County ice venues.',
    programsLine: 'Per UAHA listing: Learn to Play, House Rec, Travel B.',
    /** County parks & recreation program page (UAHA-linked registration URLs vary by rink). */
    websiteUrl:
      'https://slco.org/parks-recreation/activities/ice-programs/youth-hockey/',
  },
  {
    id: 'southern-utah-yeti-youth',
    name: 'Southern Utah Yeti (Youth)',
    regions: ['southern-utah'],
    tags: ['learn-to-play', 'house', 'travel'],
    localityLine: 'Youth hockey based in Enoch / southern Utah.',
    programsLine: 'Per UAHA listing: Learn to Play, House Rec, Travel B.',
    /** Social page cited on UAHA directory */
    websiteUrl: 'https://www.facebook.com/SouthernUtahYeti/',
  },
  {
    id: 'utah-lady-grizzlies',
    name: 'Utah Girls Hockey — Lady Grizzlies',
    regions: ['salt-lake-metro'],
    tags: ['girls', 'house', 'travel', 'tier-ii', 'tier-i-elite'],
    localityLine: 'Girls program in Salt Lake City, Utah.',
    programsLine:
      'Per UAHA listing: House Rec, Travel B, Travel A, Tier II, Tier I.',
    websiteUrl: 'https://www.utahladygrizzlies.org/',
  },
  {
    id: 'utah-high-school-hockey',
    name: 'Utah High School Hockey',
    regions: ['statewide'],
    tags: ['high-school', 'girls'],
    localityLine:
      'High school teams across Utah; affiliated or independent schedules depending on squad.',
    programsLine:
      'Per UAHA directory: leagues across Utah, including girls-only teams — see official association site.',
    websiteUrl: 'https://www.utahhighschoolhockey.com/',
  },
  {
    id: 'utah-mammoths-youth',
    name: 'Utah Mammoths (Youth)',
    regions: ['statewide'],
    tags: ['learn-to-play', 'house'],
    localityLine:
      'Statewide youth introductory programs (UAHA cites statewide footprint).',
    programsLine:
      'Per UAHA listing: Learn to Play and House Rec — confirm details on the Mammoth youth site.',
    websiteUrl: 'https://www.utahmammothyouth.com/',
  },
  {
    id: 'wmaha-junior-grizzlies',
    name: 'WMAHA — Junior Grizzlies',
    regions: ['salt-lake-metro'],
    tags: ['house', 'travel', 'tier-ii'],
    localityLine:
      'Western Mountain Hockey amateur youth umbrella program in Salt Lake City, Utah.',
    programsLine:
      'Per UAHA listing: House Rec, Travel B, Travel A, Tier II.',
    websiteUrl: 'https://www.utahjuniorgrizzlies.com/',
  },
  {
    id: 'wasatch-renegades',
    name: 'Wasatch Renegades',
    regions: ['salt-lake-metro'],
    tags: ['tier-i-elite'],
    localityLine:
      'Utah Tier I elite youth travel umbrella (UAHA summarizes as Tier I).',
    programsLine:
      'Per UAHA directory: Tier I elite youth program — specifics on the Wasatch Renegades site.',
    websiteUrl: 'https://www.wasatchrenegades.com/',
  },
  {
    id: 'wasatch-wild-hockey',
    name: 'Wasatch Wild Hockey',
    regions: ['utah-county'],
    tags: ['travel'],
    localityLine: 'Youth travel hockey centered in Provo, Utah.',
    programsLine: 'Per UAHA listing: Travel B and Travel A.',
    websiteUrl: 'https://www.wasatchwildhockey.com/',
  },
] as const

export const VALID_YOUTH_ORG_IDS = new Set(YOUTH_ORGANIZATIONS.map((o) => o.id))
