/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site origin for canonical URLs, OG tags, and sitemap (no trailing slash). */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
