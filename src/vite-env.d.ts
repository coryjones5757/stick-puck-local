/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site origin for canonical URLs, OG tags, and sitemap (no trailing slash). */
  readonly VITE_SITE_URL?: string
  /** Optional public contact email (mailto) for footer and legal pages. */
  readonly VITE_CONTACT_EMAIL?: string
  /** Google Analytics 4 measurement ID (e.g. G-XXXXXXXXXX); production builds only. */
  readonly VITE_GA_MEASUREMENT_ID?: string
}

interface Window {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
