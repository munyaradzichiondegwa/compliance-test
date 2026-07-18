import React from 'react';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ZACC Portal — unexpected UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-parchment p-6">
          <div className="card max-w-md w-full p-8 text-center">
            <h1 className="font-display text-xl font-semibold text-ink mb-2">Something went wrong</h1>
            <p className="text-sm text-slate mb-5">
              An unexpected error occurred. Reloading the page usually resolves this. If it
              persists, please contact your system administrator.
            </p>
            <button className="btn-primary w-full" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
