import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'

export default function ResourcesPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap">
          <h1 className="legal-doc__title">Resources</h1>
          <p className="legal-doc__callout">
            Links below are for convenience. Salty Puck is not responsible for third-party content.
          </p>

          <section id="tryouts" className="resources-section">
            <h2>Tryouts</h2>
            <p>Tryout listings are not part of the stick-and-puck schedule yet.</p>
            <p>
              Check club and association sites, or ask at your home rink for travel and junior tryout information.
            </p>
          </section>

          <section id="camps" className="resources-section">
            <h2>Camps &amp; clinics</h2>
            <p>Camp schedules are not aggregated here yet. Use official rink and program registration pages.</p>
          </section>

          <section className="resources-section">
            <h2>Rink directories</h2>
            <p>
              Use the <strong>Rinks</strong> tab and each event’s “official schedule source” link to reach facility
              pages directly.
            </p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
