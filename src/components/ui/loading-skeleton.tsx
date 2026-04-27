"use client";

import React, { useState, useEffect } from 'react';

interface LoadingSkeletonProps {
  className?: string;
  /** Timeout in ms before showing an error message (default 5000) */
  timeout?: number;
  /** Custom error message shown after timeout */
  errorMessage?: string;
}

/**
 * Pulsing placeholder shown while Supabase data loads.
 * After the timeout, switches to an error message.
 */
export function LoadingSkeleton({
  className = '',
  timeout = 5000,
  errorMessage = 'Having trouble loading data. Please refresh the page.',
}: LoadingSkeletonProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), timeout);
    return () => clearTimeout(timer);
  }, [timeout]);

  if (timedOut) {
    return (
      <div className={`text-sm text-red-500 p-3 ${className}`}>
        {errorMessage}
      </div>
    );
  }

  return (
    <div className={`animate-pulse space-y-2 p-3 ${className}`}>
      <div className="h-4 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  );
}
