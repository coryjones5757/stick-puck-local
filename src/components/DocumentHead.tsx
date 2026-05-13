import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { seoForPathname } from '../seoRoutes'

function publicSiteOrigin(): string {
  const fromEnv = import.meta.env.VITE_SITE_URL
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

function setMetaContent(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setLinkHref(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/**
 * Updates document title, description, canonical, and social tags on SPA navigations.
 */
export function DocumentHead() {
  const { pathname } = useLocation()
  const { title, description } = seoForPathname(pathname)
  const origin = publicSiteOrigin()
  const canonical = `${origin}${pathname === '/' ? '/' : pathname}`
  const ogImage = `${origin}/hero-outdoor-rink.svg`

  useLayoutEffect(() => {
    document.title = title

    setMetaContent('name', 'description', description)
    setLinkHref('canonical', canonical)

    setMetaContent('property', 'og:url', canonical)
    setMetaContent('property', 'og:title', title)
    setMetaContent('property', 'og:description', description)
    setMetaContent('property', 'og:image', ogImage)

    setMetaContent('name', 'twitter:title', title)
    setMetaContent('name', 'twitter:description', description)
    setMetaContent('name', 'twitter:image', ogImage)
  }, [title, description, canonical, ogImage])

  return null
}
