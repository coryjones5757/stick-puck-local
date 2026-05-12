import { Link } from 'react-router-dom'
import { SiteFooter } from '../components/SiteFooter'
import { SiteHeader } from '../components/SiteHeader'

export default function NotFoundPage() {
  return (
    <>
      <SiteHeader />
      <main className="page simple-page" id="top">
        <article className="legal-doc page-wrap" style={{ textAlign: 'center', paddingTop: '48px' }}>
          <h1 className="legal-doc__title">404 — Page not found</h1>
          <p className="legal-doc__callout" style={{ maxWidth: '36ch', margin: '16px auto 32px' }}>
            The page you're looking for doesn't exist or has moved.
          </p>
          <Link to="/" className="btn btn--accent" style={{ display: 'inline-block' }}>
            Back to schedule
          </Link>
        </article>
      </main>
      <SiteFooter />
    </>
  )
}
