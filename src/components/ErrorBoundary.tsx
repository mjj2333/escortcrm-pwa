import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
  errorInfo: string | null
}

/**
 * React ErrorBoundary — catches uncaught render/lifecycle errors and shows
 * a recovery UI instead of a blank white screen.
 *
 * Wrap around the root App or any subtree that should be isolated:
 *   <ErrorBoundary><App /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // errorInfo.componentStack contains the full React component trace
    this.setState({ errorInfo: info.componentStack ?? null })
    console.error('[ErrorBoundary] Uncaught error:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null, errorInfo: null })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center p-6 text-center"
          style={{ backgroundColor: 'var(--bg-primary, #0f0f0f)' }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}
          >
            <AlertTriangle size={32} color="#ef4444" />
          </div>

          <h1
            className="text-xl font-bold mb-2"
            style={{ color: 'var(--text-primary, #fff)' }}
          >
            Something went wrong
          </h1>

          <p
            className="text-sm mb-6 max-w-xs"
            style={{ color: 'var(--text-secondary, #888)' }}
          >
            Companion ran into an unexpected error. Your data is safe — this is a display issue only.
          </p>

          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-purple-600 active:scale-[0.97] mb-3"
          >
            <RefreshCw size={16} />
            Try again
          </button>

          <button
            onClick={() => window.location.reload()}
            className="text-sm py-2"
            style={{ color: 'var(--text-secondary, #888)' }}
          >
            Reload app
          </button>

          {/* Show error details in development */}
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-6 text-left max-w-sm w-full">
              <summary
                className="text-xs cursor-pointer mb-1"
                style={{ color: 'var(--text-secondary, #888)' }}
              >
                Error details (dev only)
              </summary>
              <pre
                className="text-xs p-3 rounded-lg overflow-auto max-h-40"
                style={{
                  backgroundColor: 'rgba(239,68,68,0.08)',
                  color: '#ef4444',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {this.state.error.message}
                {this.state.errorInfo}
              </pre>
            </details>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
