import { Component, type ReactNode } from 'react'
import { ErrorState } from '@/components/ui/states'

/**
 * Catches errors thrown while loading or rendering a page, so one failing page shows
 * an error with a retry button instead of unmounting the whole app (a blank screen).
 * Give it key={pathname} so navigating to another page clears the error.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.warn('Page failed to load or render:', error)
  }

  render() {
    if (this.state.error) {
      return <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />
    }
    return this.props.children
  }
}
