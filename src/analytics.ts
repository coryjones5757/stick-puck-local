const GA_ID = (
  import.meta.env.VITE_GA_MEASUREMENT_ID || (import.meta.env.PROD ? 'G-8GTR4M4LN1' : '')
).trim()

/** Send a page_view for SPA navigations (gtag is in index.html on production builds). */
export function trackPageView(pagePath: string): void {
  if (!GA_ID || !import.meta.env.PROD) return
  if (typeof window.gtag !== 'function') return
  window.gtag('config', GA_ID, { page_path: pagePath })
}
