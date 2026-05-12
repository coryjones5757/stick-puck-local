import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { RINK_COLORS, RINK_REGISTRY } from '../rinkData'

export default function RinksPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap">
          <h1 className="legal-doc__title">Rinks in the app</h1>
          <p className="legal-doc__callout">
            These venues may appear when we have a live or partial public feed. <strong>Always confirm</strong> sessions
            on the official rink site or by phone.
          </p>
          <ul className="rinks-list">
            {RINK_REGISTRY.map((r) => (
              <li key={r.id} className="rinks-list__item">
                <span
                  className="rinks-list__swatch"
                  style={{ background: RINK_COLORS[r.id] ?? '#64748b' }}
                  aria-hidden
                />
                <div>
                  <strong>{r.id}</strong>
                  <span className="rinks-list__abbrev">{r.abbrev}</span>
                </div>
              </li>
            ))}
          </ul>
          <p>
            Coverage for other northern Utah facilities is described in the schedule sidebar under <strong>Source</strong>{' '}
            status when data loads.
          </p>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
