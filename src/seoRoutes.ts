type RouteSeo = {
  title: string
  description: string
}

const HOME_DESCRIPTION =
  'Salty Puck — Utah stick & puck and drop-in sessions from consolidated public rink schedules.'

/** Exact pathname → tab title + meta description (client-updated). */
export const SEO_BY_PATH: Record<string, RouteSeo> = {
  '/': {
    title: 'Salty Puck · Stick & Puck Finder',
    description: HOME_DESCRIPTION,
  },
  '/rinks': {
    title: 'Rinks · Salty Puck',
    description:
      'Northern Utah ice rinks on Salty Puck — official links, directions, and schedule coverage notes.',
  },
  '/resources': {
    title: 'Resources · Salty Puck',
    description: 'Links and resources for Utah hockey players — rinks, schedules, and Salty Puck.',
  },
  '/youth-organizations': {
    title: 'Utah youth hockey organizations · Salty Puck',
    description:
      'Directory of Utah Amateur Hockey–listed youth hockey associations — official links only, no affiliation with Salty Puck.',
  },
  '/terms': {
    title: 'Terms of use · Salty Puck',
    description: 'Terms of use for Salty Puck — independent Utah stick & puck / drop-in schedule viewer.',
  },
  '/privacy': {
    title: 'Privacy · Salty Puck',
    description: 'Privacy policy for Salty Puck — how we handle data when you use the site.',
  },
}

export const SEO_NOT_FOUND: RouteSeo = {
  title: 'Page not found · Salty Puck',
  description: 'That page does not exist. Return to Salty Puck for Utah stick & puck and drop-in sessions.',
}

export function seoForPathname(pathname: string): RouteSeo {
  return SEO_BY_PATH[pathname] ?? SEO_NOT_FOUND
}
