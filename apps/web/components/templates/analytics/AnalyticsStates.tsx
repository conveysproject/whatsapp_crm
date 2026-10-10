import type { JSX } from "react";

export function AnalyticsSkeleton(): JSX.Element {
  return (
    <div data-testid="analytics-loading" role="status" aria-label="Loading analytics" className="space-y-4 animate-pulse">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-gray-700" />)}
      </div>
      <div className="h-40 rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

export function AnalyticsEmpty(): JSX.Element {
  return (
    <div data-testid="analytics-empty" className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center space-y-1">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">No messages sent with this template yet</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">Results appear here once messages are sent.</p>
    </div>
  );
}

export function AnalyticsError({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <div role="alert" data-testid="analytics-error" className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 space-y-3">
      <p className="text-sm text-red-800 dark:text-red-200">{message}</p>
      <button type="button" onClick={onRetry} className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500">
        Retry
      </button>
    </div>
  );
}

export function AnalyticsMessage({ message, testId }: { message: string; testId: string }): JSX.Element {
  return (
    <div role="alert" data-testid={testId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-700 dark:text-gray-200">
      {message}
    </div>
  );
}
