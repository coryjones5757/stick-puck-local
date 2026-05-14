import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'

import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import {
  UAHA_ORGANIZATIONS_URL,
  VALID_YOUTH_ORG_IDS,
  YOUTH_ORG_REGION_LABELS,
  YOUTH_ORG_TAG_LABELS,
  YOUTH_ORGANIZATIONS,
  type YouthOrgProgramTagId,
  type YouthOrgRegionId,
} from '../youthOrganizationsData'

/** Allow only http(s) anchors */
function safeHref(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    /* invalid */
  }
  return '#'
}

const FAVORITE_YOUTH_ORGS_KEY = 'saltypuck-favorite-youth-org-ids'

function readFavoriteIds(): string[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = localStorage.getItem(FAVORITE_YOUTH_ORGS_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((id): id is string => typeof id === 'string' && VALID_YOUTH_ORG_IDS.has(id))
  } catch {
    return []
  }
}

export default function YouthOrganizationsPage() {
  const [favoritesOrder, setFavoritesOrder] = useState<string[]>(() => readFavoriteIds())
  const [region, setRegion] = useState<YouthOrgRegionId | 'all'>('all')
  const [tagFilters, setTagFilters] = useState<Partial<Record<YouthOrgProgramTagId, boolean>>>(() => ({}))
  const [query, setQuery] = useState('')

  const activeTagList = useMemo(() => {
    return (Object.keys(tagFilters) as YouthOrgProgramTagId[]).filter((k) => tagFilters[k])
  }, [tagFilters])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const hasTagFilter = activeTagList.length > 0
    return YOUTH_ORGANIZATIONS.filter((org) => {
      if (region !== 'all' && !org.regions.includes(region)) {
        return false
      }
      if (hasTagFilter) {
        const any = activeTagList.some((t) => org.tags.includes(t))
        if (!any) {
          return false
        }
      }
      if (!q) {
        return true
      }
      const blob = `${org.name} ${org.localityLine} ${org.programsLine}`.toLowerCase()
      return blob.includes(q)
    })
  }, [region, activeTagList, query])

  const favSet = useMemo(() => new Set(favoritesOrder), [favoritesOrder])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      const af = favSet.has(a.id)
      const bf = favSet.has(b.id)
      if (af !== bf) {
        return af ? -1 : 1
      }
      if (af && bf) {
        return favoritesOrder.indexOf(a.id) - favoritesOrder.indexOf(b.id)
      }
      return a.name.localeCompare(b.name)
    })
    return copy
  }, [filtered, favoritesOrder, favSet])

  function persistFavorites(next: string[]) {
    setFavoritesOrder(next)
    try {
      localStorage.setItem(FAVORITE_YOUTH_ORGS_KEY, JSON.stringify(next))
    } catch {
      /* quota / private mode */
    }
  }

  function toggleFavorite(orgId: string) {
    const idx = favoritesOrder.indexOf(orgId)
    const next =
      idx >= 0 ? favoritesOrder.filter((id) => id !== orgId) : [...favoritesOrder, orgId]
    persistFavorites(next)
  }

  function clearFilters() {
    setRegion('all')
    setTagFilters({})
    setQuery('')
  }

  return (
    <>
      <SiteHeader />
      <main className="page simple-page youth-orgs-page" id="top">
        <div className="page-wrap youth-orgs-page__wrap">
          <header className="youth-orgs-page__hero">
            <h1 className="youth-orgs-page__title">Utah youth hockey organizations</h1>
            <p className="youth-orgs-page__lede">
              Starter directory of youth associations commonly listed under Utah Amateur Hockey (UAHA). We list text
              names and outbound links only — no logos. Salty Puck is not affiliated with UAHA or any program below.
            </p>
            <ul className="youth-orgs-page__checks">
              <li>Confirm ages, tiers, fees, and tryouts on each program&apos;s official site.</li>
              <li>
                For open ice sessions, use the <Link to="/">home schedule</Link>.
              </li>
              <li>
                For venues, see <Link to="/rinks">Utah ice rinks</Link>.
              </li>
            </ul>
          </header>

          <section className="panel youth-orgs-page__toolbar" aria-label="Filter organizations">
            <div className="youth-orgs-page__toolbar-row">
              <label className="youth-orgs-page__field">
                <span className="visually-hidden">Search</span>
                <input
                  className="youth-orgs-page__input"
                  type="search"
                  placeholder="Search by name or location…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="youth-orgs-page__field youth-orgs-page__field--select">
                <span className="youth-orgs-page__label">Region</span>
                <select
                  className="youth-orgs-page__select"
                  value={region}
                  onChange={(e) => setRegion(e.target.value as YouthOrgRegionId | 'all')}
                >
                  <option value="all">All regions</option>
                  {(Object.entries(YOUTH_ORG_REGION_LABELS) as [YouthOrgRegionId, string][]).map(([id, lab]) => (
                    <option key={id} value={id}>
                      {lab}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn--outline youth-orgs-page__clear" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
            <fieldset className="youth-orgs-page__tags-fieldset">
              <legend className="youth-orgs-page__legend">Program emphasis (match any)</legend>
              <div className="youth-orgs-page__tag-grid">
                {(Object.entries(YOUTH_ORG_TAG_LABELS) as [YouthOrgProgramTagId, string][]).map(([id, lab]) => (
                  <label key={id} className="youth-orgs-page__tag">
                    <input
                      type="checkbox"
                      checked={Boolean(tagFilters[id])}
                      onChange={(e) =>
                        setTagFilters((prev) => ({
                          ...prev,
                          [id]: e.target.checked,
                        }))
                      }
                    />
                    <span>{lab}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="youth-orgs-page__count" aria-live="polite">
              <strong>{sorted.length}</strong> of <strong>{YOUTH_ORGANIZATIONS.length}</strong> organizations shown. Stars pin
              favorites to the top (saved in this browser).
            </p>
          </section>

          <ul className="youth-orgs-page__list">
            {sorted.map((org) => (
              <li key={org.id}>
                <article className="youth-org-card panel">
                  <header className="youth-org-card__header">
                    <div className="youth-org-card__head-text">
                      <h2 className="youth-org-card__title">{org.name}</h2>
                      <p className="youth-org-card__regions">
                        {org.regions.map((r) => (
                          <span key={r} className="youth-org-card__pill youth-org-card__pill--region">
                            {YOUTH_ORG_REGION_LABELS[r]}
                          </span>
                        ))}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`rink-schedule-card__favorite youth-org-card__favorite ${
                        favSet.has(org.id) ? 'rink-schedule-card__favorite--on' : ''
                      }`}
                      aria-pressed={favSet.has(org.id)}
                      aria-label={
                        favSet.has(org.id) ? `Remove ${org.name} from favorites` : `Favorite ${org.name}`
                      }
                      title={favSet.has(org.id) ? 'Remove favorite' : 'Favorite — pin to top'}
                      onClick={() => toggleFavorite(org.id)}
                    >
                      <span aria-hidden>{favSet.has(org.id) ? '★' : '☆'}</span>
                    </button>
                  </header>
                  <div className="youth-org-card__tags">
                    {org.tags.map((t) => (
                      <span key={t} className="youth-org-card__pill youth-org-card__pill--tag">
                        {YOUTH_ORG_TAG_LABELS[t]}
                      </span>
                    ))}
                  </div>
                  <p className="youth-org-card__lead">{org.localityLine}</p>
                  <p className="youth-org-card__programs">{org.programsLine}</p>
                  <div className="youth-org-card__actions">
                    {org.websiteUrl ? (
                      <a
                        className="btn btn--accent"
                        href={safeHref(org.websiteUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Official website
                      </a>
                    ) : (
                      <span className="youth-org-card__muted">
                        No dedicated site listed on UAHA directory — reach the program via UAHA contacts.
                      </span>
                    )}
                    <Link className="btn btn--outline" to="/">
                      Stick &amp; Puck / Drop-In
                    </Link>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          {sorted.length === 0 ? (
            <p className="youth-orgs-page__empty panel">Nothing matches — try clearing filters or a simpler search.</p>
          ) : null}

          <aside className="panel youth-orgs-page__footnote" aria-label="Sources and disclaimers">
            <h2 className="youth-orgs-page__footnote-title">Sources</h2>
            <p className="youth-orgs-page__footnote-body">
              Association names, geography lines, and program summaries come from UAHA&apos;s{' '}
              <a href={UAHA_ORGANIZATIONS_URL} target="_blank" rel="noopener noreferrer">
                member organizations directory
              </a>
              . We intentionally omit logos, ratings, pricing, tryout grids, and long copied prose.
            </p>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
