/**
 * ErrorBoundary - Catches React errors to prevent entire app from crashing
 *
 * When a panel component throws (e.g., undefined.split()), this boundary
 * catches the error and displays a fallback UI instead of blanking the screen.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  panelName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const panelContext = this.props.panelName ? ` in ${this.props.panelName}` : '';
    console.error(`[ErrorBoundary] Caught error${panelContext}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-fallback" style={{
          padding: '16px',
          color: 'var(--status-error, #ef4444)',
          backgroundColor: 'var(--bg-tertiary, #0f0f1a)',
          border: '1px solid var(--status-error, #ef4444)',
          borderRadius: '4px',
          margin: '8px',
        }}>
          <h4 style={{ margin: '0 0 8px 0' }}>
            {this.props.panelName ? `${this.props.panelName} Error` : 'Panel Error'}
          </h4>
          <pre style={{
            margin: 0,
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
