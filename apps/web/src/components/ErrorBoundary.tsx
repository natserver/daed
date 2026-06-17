import type {ErrorInfo, ReactNode} from 'react';
import { Component   } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="rounded-lg bg-white p-8 shadow-lg dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-semibold text-red-600">Something went wrong</h2>
              <p className="mb-4 text-gray-600 dark:text-gray-300">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
              >
                Reload Page
              </button>
            </div>
          </div>
        )
      )
    }

    return this.props.children
  }
}
