import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap">
          <h1 className="legal-doc__title">Terms of use</h1>
          <p className="legal-doc__meta">Last updated: May 12, 2026 · Utah, USA</p>
          <p className="legal-doc__callout">
            This is general information, not legal advice. Have a qualified attorney review policies for your situation.
          </p>

          <h2>Agreement</h2>
          <p>
            By using Salty Puck (“the site”), you agree to these terms. If you do not agree, do not use the site.
          </p>

          <h2>No affiliation</h2>
          <p>
            Salty Puck is an independent project. We are <strong>not</strong> affiliated with, endorsed by, sponsored by,
            or officially connected to any ice rink, arena, municipality, hockey association, Google, QuickScores, or
            other third party whose public data may appear here. Trade names are used only to identify where sessions may
            occur (
            <em>nominative fair use</em>).
          </p>

          <h2>Information only</h2>
          <p>
            Session listings are assembled from public sources (for example public calendar feeds and PDF schedules). They
            are <strong>not guaranteed</strong> to be accurate, complete, or current. Ice times, pricing, age rules, skill
            requirements, capacity, and registration can change without notice.
          </p>

          <h2>Your responsibility</h2>
          <p>
            You are solely responsible for confirming date, time, location, cost, age eligibility, equipment rules, and
            registration with the <strong>official facility</strong> before you travel or pay.
          </p>

          <h2>No warranty</h2>
          <p>
            The site is provided “as is” and “as available,” without warranties of any kind, express or implied, including
            merchantability or fitness for a particular purpose, to the maximum extent allowed by law.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Salty Puck and its operators are <strong>not liable</strong> for any
            indirect, incidental, special, consequential, or punitive damages, or any loss arising from your use of or
            reliance on the site (including missed sessions, travel costs, or scheduling errors).
          </p>

          <h2>Acceptable use</h2>
          <p>
            Do not misuse the site or the infrastructure (including automated abuse, attempting to overload servers, or
            interfering with other users). We may suspend access that appears harmful.
          </p>

          <h2>Changes</h2>
          <p>We may update these terms at any time. Continued use after changes means you accept the updated terms.</p>

          <h2>Contact</h2>
          <p>
            For questions about these terms, use the contact method published on the site (when available) or in the
            repository/README where the project is hosted.
          </p>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
