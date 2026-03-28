"use client";

import React, { Component, ReactNode } from "react";

interface AuctionErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface AuctionErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary specifically designed for auction components.
 * Provides graceful fallback UI when auction-related components fail.
 */
export class AuctionErrorBoundary extends Component<
  AuctionErrorBoundaryProps,
  AuctionErrorBoundaryState
> {
  constructor(props: AuctionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): AuctionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Auction component error:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-lg border border-red-700/50 bg-red-950/20 p-6 text-center">
          <div className="mb-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-900/50 p-3">
              <svg
                className="text-red-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
          </div>
          
          <h3 className="text-lg font-semibold text-red-200 mb-2">
            Auction Interface Error
          </h3>
          
          <p className="text-red-300 text-sm mb-4">
            The auction interface encountered an unexpected error. Please refresh the page to continue.
          </p>
          
          {this.state.error && (
            <details className="text-xs text-red-400 mb-4 text-left">
              <summary className="cursor-pointer mb-2 font-medium">Error Details</summary>
              <pre className="whitespace-pre-wrap bg-red-950/40 p-2 rounded border border-red-800">
                {this.state.error.message}
              </pre>
            </details>
          )}
          
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center px-4 py-2 border border-red-600 text-sm font-medium rounded-md text-red-200 bg-red-900/50 hover:bg-red-900/70 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors duration-200"
          >
            <svg
              className="-ml-1 mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Loading skeleton for auction components
 */
export function AuctionLoadingSkeleton({ 
  type = "board",
  className = "" 
}: {
  type?: "board" | "workspace" | "rail" | "modal";
  className?: string;
}) {
  const skeletonClasses = "animate-pulse bg-slate-700/50 rounded";
  
  if (type === "board") {
    return (
      <div className={`space-y-4 ${className}`} aria-label="Loading auction board">
        <div className="grid grid-cols-6 gap-4 p-4 border border-slate-800 rounded-lg">
          <div className={`${skeletonClasses} h-4 col-span-2`} />
          <div className={`${skeletonClasses} h-4`} />
          <div className={`${skeletonClasses} h-4`} />
          <div className={`${skeletonClasses} h-4`} />
          <div className={`${skeletonClasses} h-4`} />
        </div>
        
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="grid grid-cols-6 gap-4 p-4 border-b border-slate-800">
            <div className={`${skeletonClasses} h-6 col-span-2`} />
            <div className={`${skeletonClasses} h-6`} />
            <div className={`${skeletonClasses} h-6`} />
            <div className={`${skeletonClasses} h-6`} />
            <div className={`${skeletonClasses} h-6`} />
          </div>
        ))}
      </div>
    );
  }
  
  if (type === "workspace") {
    return (
      <div className={`space-y-6 p-6 ${className}`} aria-label="Loading player workspace">
        <div className="space-y-2">
          <div className={`${skeletonClasses} h-8 w-48`} />
          <div className={`${skeletonClasses} h-4 w-32`} />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className={`${skeletonClasses} h-12`} />
          <div className={`${skeletonClasses} h-12`} />
        </div>
        
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={`${skeletonClasses} h-16`} />
          ))}
        </div>
      </div>
    );
  }
  
  if (type === "rail") {
    return (
      <div className={`space-y-4 ${className}`} aria-label="Loading manager context">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 border border-slate-800 rounded-lg space-y-3">
            <div className={`${skeletonClasses} h-4 w-24`} />
            <div className="space-y-2">
              <div className={`${skeletonClasses} h-3 w-full`} />
              <div className={`${skeletonClasses} h-3 w-3/4`} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className={`${skeletonClasses} h-32 w-full ${className}`} aria-label="Loading..." />
  );
}

/**
 * Component for displaying connection/sync status in auction
 */
export function AuctionConnectionStatus({ 
  isConnected = true,
  lastSyncTime,
  className = ""
}: {
  isConnected?: boolean;
  lastSyncTime?: Date;
  className?: string;
}) {
  const statusColor = isConnected ? "text-green-400" : "text-red-400";
  const statusText = isConnected ? "Connected" : "Disconnected";
  const statusIcon = isConnected ? "●" : "●";
  
  return (
    <div className={`flex items-center gap-2 text-xs ${statusColor} ${className}`}>
      <span aria-label={`Connection status: ${statusText}`}>
        {statusIcon}
      </span>
      <span>{statusText}</span>
      {lastSyncTime && (
        <span className="text-slate-400">
          · Last sync: {lastSyncTime.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}