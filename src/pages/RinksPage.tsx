import type { CSSProperties } from 'react'

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

function IconWebsite({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function IconPhone({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function IconDirections({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  )
}

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
                      <div className="rink-card__quick-links" role="group" aria-label={`Quick links for ${r.id}`}>
                        <a
                          className="rink-card__icon-link"
                          href={r.officialUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                          title="Official website"
                          aria-label={`${r.id} — official website (opens in new tab)`}
                        >
                          <IconWebsite className="rink-card__icon-link-glyph" />
                        </a>
                        {phoneHref ? (
                          <a
                            className="rink-card__icon-link"
                            href={phoneHref}
                            title={`Call ${r.phone}`}
                            aria-label={`Call ${r.id} at ${r.phone}`}
                          >
                            <IconPhone className="rink-card__icon-link-glyph" />
                          </a>
                        ) : (
                          <span
                            className="rink-card__icon-link rink-card__icon-link--disabled"
                            title="Phone not listed"
                            aria-label="Phone number not listed"
                            role="img"
                          >
                            <IconPhone className="rink-card__icon-link-glyph" />
                          </span>
                        )}
                        <a
                          className="rink-card__icon-link"
                          href={googleDirectionsUrl(r.address)}
                          rel="noopener noreferrer"
                          target="_blank"
                          title="Directions in Google Maps"
                          aria-label={`Directions to ${r.id} (opens in new tab)`}
                        >
                          <IconDirections className="rink-card__icon-link-glyph" />
                        </a>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>

          <p className="rinks-page__footnote">
            Cards use an exterior photo when we have one, otherwise initials on a rink-colored panel (same motif as the
            schedule Rinks grid). Other northern Utah facilities may show up in schedule <strong>Source</strong> status
            as we add feeds.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
