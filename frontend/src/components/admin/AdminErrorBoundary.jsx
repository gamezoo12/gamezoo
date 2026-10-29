import { Component } from 'react';

// Keeps the admin shell usable when a page throws while rendering.
export default class AdminErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Admin page crashed', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6" role="alert" data-testid="admin-page-error">
        <h2 className="font-bold text-rose-800">This page hit an error</h2>
        <p className="mt-1 text-sm text-rose-700">The rest of the Admin Panel is still working.</p>
        <button type="button" onClick={() => this.setState({ error: null })} className="mt-3 rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">
          Try again
        </button>
      </div>
    );
  }
}
