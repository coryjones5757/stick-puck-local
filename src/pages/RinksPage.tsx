import { Link } from 'react-router-dom'

import { NorthernUtahSchematicMap } from '../components/NorthernUtahSchematicMap'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { RINK_COLORS, RINK_REGISTRY, rinkSlug } from '../rinkData'

const RINKS_SORTED = [...RINK_REGISTRY].sort((a, b) => a.id.localeCompare(b.id))

export default function RinksPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page rinks-page" id="top">
        <div className="page-wrap rinks-page__wrap">
          <header className="rinks-page__hero">
            <h1 className="rinks-page__title">Utah hockey rinks</h1>
            <p className="rinks-page__lede">
              Venues that can appear on Salty Puck when we have a live or partial public feed. Always confirm sessions on
              the official rink site or by phone.
            </p>
          </header>

          <div className="rinks-page__grid">
            <div className="rinks-page__list-col">
              <ul className="rinks-page__cards">
                {RINKS_SORTED.map((r) => {
                  const color = RINK_COLORS[r.id] ?? '#64748b'
                  const slug = rinkSlug(r.id)
                  return (
                    <li key={r.id}>
                      <article className="rink-card" id={`rink-card-${slug}`}>
                        <div className="rink-card__accent" style={{ background: color }} aria-hidden />
                        <div className="rink-card__body">
                          <h2 className="rink-card__name">{r.id}</h2>
                          <p className="rink-card__city">{r.city}</p>
                          <p className="rink-card__blurb">{r.blurb}</p>
                          <div className="rink-card__actions">
                            <a className="btn btn--accent" href={r.officialUrl} rel="noopener noreferrer" target="_blank">
                              Official schedule
                            </a>
                            <Link className="btn btn--ghost" to="/">
                              View on Salty Puck
                            </Link>
                          </div>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>

              <p className="rinks-page__footnote">
                Other northern Utah facilities may show up in schedule <strong>Source</strong> status as we add feeds.
              </p>
            </div>

            <aside className="rinks-page__map-col" aria-label="Schematic map of northern Utah">
              <div className="rinks-page__map-panel panel">
                <NorthernUtahSchematicMap rinks={RINK_REGISTRY} />
                <p className="rinks-page__map-legend">
                  Dots match schedule colors. Click a dot to jump to that rink.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
