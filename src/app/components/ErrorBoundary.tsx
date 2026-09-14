import { Component, type ErrorInfo, type ReactNode } from 'react';
import { debugLog } from '@/modules/diagnostics/store/useDebugStore';
import { CrashRecovery } from './CrashRecovery';

interface Props {
  children: ReactNode;
  fallbackTitle?: string | undefined;
  fallbackDescription?: string | undefined;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Top-level error boundary that catches unhandled render exceptions and
 * failed lazy-chunk loads, preventing a full white-screen crash.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, componentStack: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    debugLog.error('system', 'Uncaught React render error', {
      error,
      componentStack: info.componentStack,
    });
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <CrashRecovery
          title={this.props.fallbackTitle ?? 'Something went wrong'}
          description={
            this.props.fallbackDescription ??
            'An unexpected error occurred. Try reloading or restarting the application.'
          }
          error={this.state.error ?? new Error('Unknown render failure')}
          componentStack={this.state.componentStack}
        />
      );
    }
    return this.props.children;
  }
}
