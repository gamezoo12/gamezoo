import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ShoppingBag } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Wraps any child tree; if a rendering exception fires anywhere below,
 * the fallback UI shows a friendly recovery card instead of a blank
 * white page. Also captures the error for the developer console.
 */
export default class CartErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err) {
    return { hasError: true, message: err?.message || 'Something went wrong' };
  }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error('[CartErrorBoundary]', err, info?.componentStack?.slice?.(0, 500));
  }
  clearBasket = () => {
    try { localStorage.removeItem('gamezoo_cart'); } catch { /* noop */ }
    this.setState({ hasError: false, message: '' });
    window.location.href = '/contests';
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="max-w-2xl mx-auto p-8 mt-8" data-testid="cart-error-boundary">
        <div className="bg-white rounded-2xl border-2 border-rose-200 p-8 text-center shadow-lg">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-100 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-rose-600" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-slate-900 mb-2">Your basket ran into a snag</h2>
          <p className="text-sm text-slate-600 mb-4">
            Don&apos;t worry — no payment was taken. This can happen with an old basket item.
            Clear it and pick a fresh contest.
          </p>
          <div className="text-[11px] text-slate-400 mb-6 font-mono truncate">Diagnostic: {this.state.message}</div>
          <div className="flex gap-2 justify-center">
            <Button onClick={this.clearBasket} className="pl-btn-gold text-slate-900 font-extrabold" data-testid="cart-error-clear">
              <ShoppingBag className="w-4 h-4 mr-1" /> Clear basket & browse
            </Button>
            <Link to="/">
              <Button variant="outline">Go home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }
}
