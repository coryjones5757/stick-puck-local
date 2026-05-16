import fs from 'node:fs'
import path from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

const SITEMAP_PATHS = ['/', '/rinks', '/youth-organizations', '/resources', '/terms', '/privacy']

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type SaltypuckSeoOptions = {
  siteUrl: string
  /** Injected into index.html on production builds (Google Tag Assistant expects a static script tag). */
  gaMeasurementId?: string
}

function googleTagSnippet(measurementId: string): string {
  const id = measurementId.trim()
  if (!id) return ''
  return `    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${id}');
    </script>
`
}

export function saltypuckSeoPlugin({ siteUrl, gaMeasurementId = '' }: SaltypuckSeoOptions): Plugin {
  let config: ResolvedConfig | null = null
  const origin = siteUrl.trim().replace(/\/$/, '')
  const gaId = gaMeasurementId.trim()

  function robotsTxt() {
    return ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n')
  }

  function sitemapXml() {
    const body = SITEMAP_PATHS.map((p) => {
      const loc = p === '/' ? `${origin}/` : `${origin}${p}`
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <changefreq>daily</changefreq>\n  </url>`
    }).join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
  }

  return {
    name: 'saltypuck-seo',
    configResolved(c) {
      config = c
    },
    transformIndexHtml(html) {
      let out = html.replaceAll('%SITE_URL%', origin)
      if (config?.mode === 'production' && gaId) {
        out = out.replace('</head>', `${googleTagSnippet(gaId)}  </head>`)
      }
      return out
    },
    closeBundle() {
      if (!config || config.command !== 'build') {
        return
      }
      const outDir = path.resolve(config.root, config.build.outDir)
      fs.mkdirSync(outDir, { recursive: true })
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemapXml(), 'utf8')
      fs.writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt(), 'utf8')
    },
  }
}
