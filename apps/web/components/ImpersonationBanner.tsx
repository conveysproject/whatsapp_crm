"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface ImpersonationState {
  token: string;
  orgId: string;
  orgName: string;
}

export function ImpersonationBanner(): JSX.Element | null {
  const { getToken } = useAuth();
  const [state, setState] = useState<ImpersonationState | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("impersonation");
    if (raw) {
      try {
        setState(JSON.parse(raw) as ImpersonationState);
      } catch {
        sessionStorage.removeItem("impersonation");
      }
    }
  }, []);

  async function exit() {
    if (state?.token) {
      const token = await getToken();
      void fetch(`${API_URL}/v1/admin/organizations/${state.orgId}/impersonate`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ token: state.token }),
      });
    }
    sessionStorage.removeItem("impersonation");
    setState(null);
    window.location.href = "/admin/organizations";
  }

  if (!state) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between text-sm">
      <span>Viewing as <strong>{state.orgName}</strong> (Super Admin impersonation)</span>
      <button
        onClick={() => { void exit(); }}
        className="underline hover:no-underline ml-4 font-medium"
      >
        Exit
      </button>
    </div>
  );
}
