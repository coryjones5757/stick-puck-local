import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'
import { siteContactEmail } from '../siteContact'

export default function PrivacyPage() {
  const contactEmail = siteContactEmail()

  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap">
          <h1 className="legal-doc__title">Privacy</h1>
          <p className="legal-doc__meta">Last updated: May 16, 2026</p>
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
            The schedule works without signing in. On the public production site we use{' '}
            <a href="https://analytics.google.com/" rel="noopener noreferrer">
              Google Analytics 4
            </a>{' '}
            to understand aggregate traffic (such as pages viewed, approximate location, device type, and referrer).
            Google may set cookies or use similar storage; see{' '}
            <a href="https://policies.google.com/privacy" rel="noopener noreferrer">
              Google’s Privacy Policy
            </a>
            . You can opt out with a browser extension or{' '}
            <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener noreferrer">
              Google’s Analytics opt-out add-on
            </a>
            .
          </p>

          <h2>Third parties</h2>
          <p>
            The browser may connect to third parties when you follow links (such as rink websites), when fonts are loaded
            from Google Fonts as configured in <code>index.html</code>, or when Google Analytics loads on the production
            site. Those services have their own policies.
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
            operator for requests
            {contactEmail ? (
              <>
                {' '}
                at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
              </>
            ) : (
              <> (set <code>VITE_CONTACT_EMAIL</code> at build time to show an address here).</>
            )}
          </p>

          <h2>Contact</h2>
          {contactEmail ? (
            <p>
              For privacy-related questions, email <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
            </p>
          ) : (
            <p>
              For privacy-related questions, use the same contact channel as in the Terms of use page once{' '}
              <code>VITE_CONTACT_EMAIL</code> is configured for production builds.
            </p>
          )}

          <h2>Changes</h2>
          <p>We may update this policy when the site’s data practices change.</p>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
