import type { JSX } from "react";

export function DashboardSkeleton(): JSX.Element {
  return (
    <div data-testid="dashboard-skeleton" aria-busy="true" aria-label="Loading dashboard" className="space-y-6 animate-pulse">
      <div className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      <div className="h-48 rounded-xl bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}

export function DashboardErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300"
    >
      <span className="min-w-0 break-words">Could not load the dashboard. Check your connection and try again.</span>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1 rounded border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900"
      >
        Retry
      </button>
    </div>
  );
}

export function DashboardNoAccess(): JSX.Element {
  return (
    <div
      role="alert"
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-6 text-sm text-gray-700 dark:text-gray-200"
    >
      You do not have access to the dashboard
    </div>
  );
}
