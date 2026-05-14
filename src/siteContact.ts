/** Set `VITE_CONTACT_EMAIL` at build time for footer + legal contact links (see `.env.example`). */
export function siteContactEmail(): string | null {
  const raw = import.meta.env.VITE_CONTACT_EMAIL
  if (typeof raw !== 'string') {
    return null
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}
