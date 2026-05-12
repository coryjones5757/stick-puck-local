import { Link } from 'react-router-dom'

export function SiteFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer">
      <div className="site-footer__inner page-wrap">
        <div className="site-footer__grid">
          <section className="site-footer__block" aria-labelledby="footer-about-heading">
            <h2 id="footer-about-heading" className="site-footer__heading">
              About
            </h2>
            <p className="site-footer__text">
              Independent schedule helper — not affiliated with any rink, league, or QuickScores. Names are for
              identification only.
            </p>
          </section>
          <section className="site-footer__block" aria-labelledby="footer-verify-heading">
            <h2 id="footer-verify-heading" className="site-footer__heading">
              Verify before you go
            </h2>
            <p className="site-footer__text">
              Times, fees, and ice availability change. Always confirm date and details with the official rink source.
            </p>
          </section>
        </div>

        <hr className="site-footer__rule" role="presentation" />

        <div className="site-footer__meta">
          <p className="site-footer__fineprint">
            Salty Puck shows <strong>unofficial</strong> listings parsed from public calendars and PDFs. Information may
            be incomplete or incorrect — use at your own discretion.
          </p>
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
          </nav>
          <p className="site-footer__copyright">© {year} Salty Puck. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
