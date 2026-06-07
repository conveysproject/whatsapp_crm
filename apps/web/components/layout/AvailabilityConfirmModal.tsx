"use client";
import { JSX, useEffect } from "react";

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export function AvailabilityConfirmModal({ onConfirm, onCancel }: Props): JSX.Element {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 flex flex-col items-center gap-5"
      >
        {/* Orange info icon */}
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-400">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
          </svg>
        </div>

        <h2 id="availability-modal-title" className="text-xl font-bold text-gray-900">Going Offline?</h2>

        <ul className="list-disc list-outside pl-5 space-y-2 text-sm text-gray-700 text-left w-full">
          <li>
            You&apos;re about to go offline. New chats will continue to be auto-assigned to you while you&apos;re offline.
          </li>
          <li>
            To prevent assignment while offline,{" "}
            <a href="/settings/routing" className="text-teal-700 underline font-medium">
              change assignment rules here
            </a>
          </li>
        </ul>

        <div className="flex gap-3 w-full mt-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-lg bg-teal-800 text-white font-medium text-sm hover:bg-teal-900 transition-colors"
          >
            Go Offline
          </button>
        </div>
      </div>
    </div>
  );
}
