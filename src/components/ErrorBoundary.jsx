import { Component } from 'react';
import { Sentry } from '../utils/sentry';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Forward to Sentry so caught errors (which avoid white-screen but
    // still indicate real bugs) get reported, not just unhandled ones.
    Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo?.componentStack } } });
  }

  componentDidUpdate(prevProps) {
    // Reset error state when the consumer passes a fresh resetKey
    // (typically location.pathname). Without this, a single render
    // throw inside one tab persists across navigation because the
    // boundary itself stays mounted — leaving the user stuck on the
    // error screen until they manually reload. Gated on hasError so
    // the happy path is a no-op and there is no setState loop.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      if (this.props.compact) {
        return (
          <div style={{
            padding: '16px',
            textAlign: 'center',
            background: '#1f1f1f',
            borderRadius: '12px',
            margin: '8px 0',
            color: '#9ca3af'
          }}>
            <p style={{ margin: '0 0 8px', fontSize: '14px' }}>Failed to load</p>
            <button
              onClick={this.handleRetry}
              style={{
                padding: '6px 16px',
                background: '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Retry
            </button>
          </div>
        );
      }
      return (
        <div style={{
          padding: '40px 20px',
          textAlign: 'center',
          background: '#1a1a1a',
          minHeight: '100vh',
          color: 'white'
        }}>
          <h2 style={{ marginBottom: '16px' }}>Something went wrong</h2>
          <p style={{ color: '#9ca3af', marginBottom: '24px' }}>
            Please try refreshing the page
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: '#2cb5a5',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
