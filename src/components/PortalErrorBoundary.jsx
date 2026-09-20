import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { track } from '@vercel/analytics/react';

// A last-resort safety net for render-time faults. It deliberately does not
// attempt to repair data or sign a member out: refreshing is safe and keeps
// the user's existing Supabase session intact.
export default class PortalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Keeps the technical detail available to support staff through the
    // browser console without exposing it in the member-facing screen.
    console.error('AJPA portal render error:', error, errorInfo);

    // This intentionally sends no exception content, account details, or
    // roster data. It simply lets administrators identify recurring display
    // failures in Vercel Analytics.
    track('portal_display_error');
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl">
          <AlertTriangle className="mx-auto mb-4 h-11 w-11 text-amber-600" aria-hidden="true" />
          <h1 className="text-xl font-extrabold text-slate-900">The portal needs to reload</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Something prevented this page from displaying correctly. No roster changes have been made. Please reload the portal and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-extrabold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload portal
          </button>
          <p className="mt-5 text-xs text-slate-500">
            If the problem continues, please let an AJPA Registrar know what you were trying to do.
          </p>
        </section>
      </main>
    );
  }
}
