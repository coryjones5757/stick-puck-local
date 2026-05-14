/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site origin for canonical URLs, OG tags, and sitemap (no trailing slash). */
  readonly VITE_SITE_URL?: string
  /** Optional MapLibre style JSON URL for /rinks map (e.g. MapTiler with API key). See .env.example. */
  readonly VITE_MAP_STYLE_URL?: string
  /** Optional public contact email (mailto) for footer and legal pages. */
  readonly VITE_CONTACT_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
