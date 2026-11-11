import { Component } from 'react';

/** Shows a calm message with a reload button instead of a blank page if rendering throws. */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Tampere Targets crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <p className="state-title">System fault</p>
        <p className="state-text">
          Reloading usually helps. If it keeps happening, reset the mission parameters by opening the page without its address
          parameters.
        </p>
        <pre className="state-code">{String(this.state.error?.message ?? this.state.error)}</pre>
        <div className="crash-actions">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn-ghost" href="/">
            Open without parameters
          </a>
        </div>
      </div>
    );
  }
}
