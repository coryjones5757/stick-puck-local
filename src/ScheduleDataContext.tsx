import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { ApiResponse } from './scheduleTypes'

/* This file is the app data layer (not a leaf component file). Colocate hook + Provider. */
/* eslint-disable react-refresh/only-export-components */

type ScheduleDataContextValue = {
  data: ApiResponse | null
  /** True only until the first load attempt finishes (success or error). */
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const ScheduleDataContext = createContext<ScheduleDataContextValue | null>(null)

export function ScheduleDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    async function initialLoad() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/events', { signal: controller.signal })
        let payloadUnknown: unknown = null
        try {
          payloadUnknown = await response.json()
        } catch {
          // JSON parse failed — handled below
        }
        if (!response.ok) {
          const body = payloadUnknown as { message?: string } | null
          throw new Error(body?.message || `Failed to load data (${response.status})`)
        }
        if (!cancelled) {
          setData(payloadUnknown as ApiResponse)
        }
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
          return
        }
        if (err instanceof TypeError) {
          setError(
            import.meta.env.DEV
              ? `Network error: ${err.message}. If you ran vite alone, use npm run dev or start npm run server in another terminal.`
              : 'Could not load schedules — please check your connection and try again.',
          )
          return
        }
        setError(err instanceof Error ? err.message : 'Unexpected error')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initialLoad()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const response = await fetch('/api/events')
      let payloadUnknown: unknown = null
      try {
        payloadUnknown = await response.json()
      } catch {
        // ignore
      }
      if (!response.ok) {
        const body = payloadUnknown as { message?: string } | null
        throw new Error(body?.message || `Failed to load data (${response.status})`)
      }
      setData(payloadUnknown as ApiResponse)
    } catch (err) {
      if (err instanceof TypeError) {
        setError(
          import.meta.env.DEV
            ? `Network error: ${err.message}. If you ran vite alone, use npm run dev or start npm run server in another terminal.`
            : 'Could not load schedules — please check your connection and try again.',
        )
      } else {
        setError(err instanceof Error ? err.message : 'Unexpected error')
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      data,
      loading,
      error,
      refresh,
    }),
    [data, loading, error, refresh],
  )

  return <ScheduleDataContext.Provider value={value}>{children}</ScheduleDataContext.Provider>
}

export function useScheduleData(): ScheduleDataContextValue {
  const ctx = useContext(ScheduleDataContext)
  if (!ctx) {
    throw new Error('useScheduleData must be used within ScheduleDataProvider')
  }
  return ctx
}
