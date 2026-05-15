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
              About
            </h2>
            <p className="site-footer__text">
              Salty Puck brings together Stick &amp; Puck, Drop-In Hockey, and Public Skate schedules from rinks across
              Utah into one organized place.
            </p>
            <p className="site-footer__text site-footer__text--secondary">
              We independently collect publicly available schedule information and are not affiliated with any rink,
              league, or hockey organization.
            </p>
          </section>
          <section className="site-footer__block" aria-labelledby="footer-note-heading">
            <h2 id="footer-note-heading" className="site-footer__heading">
              Quick note
            </h2>
            <p className="site-footer__text">Ice times, pricing, and rink assignments can change without notice.</p>
            <p className="site-footer__text site-footer__text--secondary">
              Always confirm details with the official rink before heading out.
            </p>
          </section>
        </div>

        <hr className="site-footer__rule" role="presentation" />

        <div className="site-footer__meta">
          <nav className="site-footer__nav" aria-label="Site links">
            <Link className="site-footer__link" to="/rinks">
              Rinks
            </Link>
            <Link className="site-footer__link" to="/youth-organizations">
              Youth Hockey
            </Link>
            <Link className="site-footer__link" to="/">
              About
            </Link>
            <Link className="site-footer__link" to="/privacy">
              Privacy
            </Link>
          </nav>
          <p className="site-footer__copyright">© {year} Salty Puck</p>
          {contactEmail ? (
            <p className="site-footer__contact">
              <a className="site-footer__contact-link" href={`mailto:${contactEmail}`}>
                {contactEmail}
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
