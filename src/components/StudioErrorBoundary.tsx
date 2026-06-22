// WHY THIS FILE EXISTS:
// A single uncaught render error in any one studio used to blank the ENTIRE app —
// React unmounts the whole tree when an error bubbles past the root with no
// boundary. During the UX audit this turned several one-record data bugs (a bad
// status enum, a malformed JSON column) into full-app white screens that needed a
// manual reload to recover.
//
// This boundary contains the blast radius to a single studio: if a studio throws
// while rendering, the user sees a recoverable error card (with the real error and
// a retry) instead of a blank page, and the header nav stays usable so they can
// switch to another studio. It is mounted with key={activeModule} in App.tsx, so
// navigating to a different studio remounts the boundary and clears any prior error.

import React from 'react';

interface Props {
  // Human-readable id of the studio being guarded — shown in the error card and
  // logged, so we know WHICH studio failed without digging through the stack.
  moduleName: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class StudioErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  // WHY: getDerivedStateFromError flips us into the fallback UI on the render that
  // threw. componentDidCatch is where we log — keep the console trail for triage.
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[StudioErrorBoundary] "${this.props.moduleName}" crashed:`, error, info.componentStack);
  }

  // WHY: lets the user retry without a full page reload — clears the error so the
  // children re-render. Useful when the failure was transient (e.g. a slow query
  // that has since resolved) rather than a hard data problem.
  handleRetry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] w-full bg-white/80 backdrop-blur-md border border-rose-200/60 rounded-2xl shadow-glass p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-4">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-base font-extrabold text-slate-800 tracking-tight">This studio hit an error</h2>
        <p className="text-xs text-slate-500 font-medium mt-1 max-w-md">
          The <span className="font-bold text-slate-700">{this.props.moduleName}</span> studio failed to render.
          The rest of the platform is unaffected — you can retry, or switch to another studio from the top navigation.
        </p>

        {/* Surface the real error message so a PM/dev can report exactly what broke. */}
        <pre className="mt-4 max-w-xl overflow-auto text-left text-[10px] leading-relaxed text-rose-600 bg-rose-50/60 border border-rose-100 rounded-lg p-3 font-mono">
          {error.message || String(error)}
        </pre>

        <button
          onClick={this.handleRetry}
          className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          Retry this studio
        </button>
      </div>
    );
  }
}
