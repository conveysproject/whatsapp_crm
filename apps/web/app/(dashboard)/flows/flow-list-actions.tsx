"use client";

import { JSX, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function FlowListActions({ flowId, flowName }: { flowId: string; flowName: string }): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function duplicate(): Promise<void> {
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/flows/${flowId}/duplicate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete "${flowName}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/flows/${flowId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-gray-400 hover:text-gray-600 px-1.5 py-1 rounded"
        disabled={busy}
      >
        ···
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
            <button
              onClick={() => void duplicate()}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Duplicate
            </button>
            <button
              onClick={() => void remove()}
              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}
