import fs from 'node:fs'
import path from 'node:path'

import type { Plugin, ResolvedConfig } from 'vite'

const SITEMAP_PATHS = ['/', '/rinks', '/resources', '/terms', '/privacy']

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function saltypuckSeoPlugin(siteUrl: string): Plugin {
  let config: ResolvedConfig | null = null
  const origin = siteUrl.trim().replace(/\/$/, '')

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
      return html.replaceAll('%SITE_URL%', origin)
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
