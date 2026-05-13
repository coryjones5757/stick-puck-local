/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site origin for canonical URLs, OG tags, and sitemap (no trailing slash). */
  readonly VITE_SITE_URL?: string
  /** Optional "Report a problem" mailto address (defaults to hello@saltypuck.com). */
  readonly VITE_FEEDBACK_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
