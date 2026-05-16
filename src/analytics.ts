const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim()

let initialized = false

function analyticsEnabled(): boolean {
  return Boolean(GA_ID && import.meta.env.PROD)
}

/** Load gtag.js and define the dataLayer stub (production only). */
export function initAnalytics(): void {
  if (!analyticsEnabled() || initialized || typeof window === 'undefined') return
  initialized = true

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`
  document.head.appendChild(script)
}

/** Send a page_view for SPA navigations (production only). */
export function trackPageView(pagePath: string): void {
  if (!analyticsEnabled() || typeof window.gtag !== 'function') return
  window.gtag('config', GA_ID, { page_path: pagePath })
}
