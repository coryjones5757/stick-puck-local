import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap">
          <h1 className="legal-doc__title">Privacy</h1>
          <p className="legal-doc__meta">Last updated: May 12, 2026</p>
          <p className="legal-doc__callout">
            This is general information, not legal advice. Adjust for your analytics, hosting, and jurisdictions with
            counsel.
          </p>

          <h2>What we collect</h2>
          <p>
            Salty Puck does not require an account to browse the schedule. If you visit the public site, our hosting
            provider or infrastructure may log standard server data (such as approximate IP address, user agent, and
            timestamps) as part of normal operation and security. We do not intentionally collect names, emails, or phone
            numbers through the schedule UI.
          </p>

          <h2>Cookies and analytics</h2>
          <p>
            This build does not require marketing cookies for core functionality. If you add analytics or advertising
            scripts later, update this page and any required consent flows for your visitors’ regions.
          </p>

          <h2>Third parties</h2>
          <p>
            The browser may connect to third parties when you follow links (such as rink websites) or when fonts are
            loaded from Google Fonts as configured in <code>index.html</code>. Those services have their own policies.
          </p>

          <h2>Children</h2>
          <p>
            The site is a general-purpose schedule viewer. It is not directed at children for collection of personal
            information.
          </p>

          <h2>Retention</h2>
          <p>
            Server log retention depends on your hosting provider’s defaults. Configure rotation and retention to match
            your policy.
          </p>

          <h2>Your rights</h2>
          <p>
            Depending on where you live (for example the EEA/UK or certain US states), you may have rights regarding
            personal data. For a minimal server-log-only deployment, many requests may be informational. Contact the site
            operator for requests.
          </p>

          <h2>Changes</h2>
          <p>We may update this policy when the site’s data practices change.</p>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
