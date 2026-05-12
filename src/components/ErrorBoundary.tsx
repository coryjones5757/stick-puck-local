import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { hasError: boolean; message?: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', err, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="status error page-wrap" role="alert">
          <h1 className="hero-title" style={{ fontSize: '1.5rem', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p>
            Try reloading the page. If this keeps happening, the schedule data may have changed format on the upstream
            sources.
          </p>
          {import.meta.env.DEV && this.state.message ? (
            <pre className="status__hint" style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>
              {this.state.message}
            </pre>
          ) : null}
          <button type="button" className="btn btn--accent" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
