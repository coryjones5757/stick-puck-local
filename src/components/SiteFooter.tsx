import { Link } from 'react-router-dom'

import { siteContactEmail } from '../siteContact'

export function SiteFooter() {
  const year = new Date().getFullYear()
  const contactEmail = siteContactEmail()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner page-wrap">
        <div className="site-footer__grid">
          <section className="site-footer__block" aria-labelledby="footer-about-heading">
            <h2 id="footer-about-heading" className="site-footer__heading">
              Our mission
            </h2>
            <p className="site-footer__text">
              We built Salty Puck to make it easier to find stick &amp; puck, Drop-In, and Public Skate times across
              Utah—less tab-hopping, more ice time. We love this sport and want the barrier to practice to be lower for
              everyone who shares the rink with us.
            </p>
            <p className="site-footer__text site-footer__text--secondary">
              Salty Puck is an independent project. We are not affiliated with any rink, league, or schedule provider;
              rink names appear for identification only.
            </p>
          </section>
          <section className="site-footer__block" aria-labelledby="footer-verify-heading">
            <h2 id="footer-verify-heading" className="site-footer__heading">
              Before you go
            </h2>
            <p className="site-footer__text">
              Sessions here are aggregated from public calendars and PDFs. Times, fees, and ice assignments can change
              without notice—always double-check the official rink or county page before you drive.
            </p>
          </section>
        </div>

        <hr className="site-footer__rule" role="presentation" />

        <div className="site-footer__meta">
          <p className="site-footer__fineprint">
            Salty Puck shows <strong>unofficial</strong> listings parsed from public calendars and PDFs. Information may
            be incomplete or incorrect — use at your own discretion.
          </p>
          {contactEmail ? (
            <p className="site-footer__contact">
              <a className="site-footer__contact-link" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </p>
          ) : null}
          <nav className="site-footer__nav" aria-label="Legal">
            <Link className="site-footer__link" to="/terms">
              Terms of use
            </Link>
            <Link className="site-footer__link" to="/privacy">
              Privacy
            </Link>
            <Link className="site-footer__link" to="/rinks">
              Rinks
            </Link>
            <Link className="site-footer__link" to="/youth-organizations">
              Youth Hockey
            </Link>
          </nav>
          <p className="site-footer__copyright">© {year} Salty Puck. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
