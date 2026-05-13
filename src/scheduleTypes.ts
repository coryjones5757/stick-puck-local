/** Shared schedule API types (kept separate from the provider for React Fast Refresh). */

export type SourceStatus = {
  id: string
  name: string
  status: 'live' | 'partial' | 'manual'
  detail: string
  url: string
}

export type HockeyEvent = {
  id: string
  title: string
  type: string
  rink: string
  location: string
  city: string
  start: string
  end: string
  sourceUrl: string
  sourceType: string
}

export type ApiResponse = {
  generatedAt: string
  connectorErrors: string[]
  sourceStatus: SourceStatus[]
  events: HockeyEvent[]
}
