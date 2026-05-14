import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'

import RinksMap from '../components/RinksMap'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import {
  RINK_COLORS,
  RINK_REGISTRY,
  googleDirectionsUrl,
  rinkPhotoFor,
  rinkSlug,
  rinkThumbInitials,
  telHref,
} from '../rinkData'

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
                  const phoneHref = telHref(r.phone)
                  const photo = rinkPhotoFor(r.id)
                  return (
                    <li key={r.id}>
                      <article className="rink-card rink-card--has-photo" id={`rink-card-${slug}`}>
                        {photo ? (
                          <div className="rink-card__photo">
                            <img
                              className="rink-card__photo-img"
                              src={photo.src}
                              alt={photo.alt}
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        ) : (
                          <div
                            className="rink-card__photo rink-card__photo--placeholder"
                            style={{ '--rink-thumb-accent': color } as CSSProperties}
                            aria-hidden
                          >
                            <span className="rink-card__photo-initials">{rinkThumbInitials(r.abbrev)}</span>
                          </div>
                        )}
                        <div className="rink-card__accent" style={{ background: color }} aria-hidden />
                        <div className="rink-card__body">
                          <h2 className="rink-card__name">{r.id}</h2>
                          <p className="rink-card__city">{r.city}</p>
                          <p className="rink-card__address">{r.address}</p>
                          <p className="rink-card__blurb">{r.blurb}</p>
                          <div className="rink-card__actions">
                            <div className="rink-card__actions-primary">
                              <a className="btn btn--accent" href={r.officialUrl} rel="noopener noreferrer" target="_blank">
                                Website
                              </a>
                              <a
                                className="btn btn--outline"
                                href={googleDirectionsUrl(r.address)}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Directions
                              </a>
                            </div>
                            <div className="rink-card__actions-secondary">
                              {phoneHref ? (
                                <a className="btn btn--muted" href={phoneHref}>
                                  Call
                                </a>
                              ) : null}
                              <Link className="btn btn--ghost" to="/">
                                View on Salty Puck
                              </Link>
                            </div>
                          </div>
                        </div>
                      </article>
                    </li>
                  )
                })}
              </ul>

              <p className="rinks-page__footnote">
                Cards use an exterior photo when we have one, otherwise initials on a rink-colored panel (same motif as the
                schedule Rinks grid). Other northern Utah facilities may show up in schedule <strong>Source</strong>{' '}
                status as we add feeds.
              </p>
            </div>

            <aside className="rinks-page__map-col" aria-label="Map of Utah hockey rinks">
              <div className="rinks-page__map-panel panel">
                <RinksMap rinks={RINK_REGISTRY} />
                <p className="rinks-page__map-legend">
                  Pins match schedule colors. Click a pin to jump to that rink.
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
