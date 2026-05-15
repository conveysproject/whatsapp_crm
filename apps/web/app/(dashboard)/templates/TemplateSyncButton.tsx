"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Toast, useToast } from "@/components/ui/Toast";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function TemplateSyncButton(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const { toast, toastState, setToastOpen } = useToast();

  async function handleSync() {
    const token = await getToken();
    if (!token) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/v1/templates/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: { synced: number } };
        toast(`Synced ${json.data.synced} template${json.data.synced !== 1 ? "s" : ""} from Meta`, { variant: "success" });
        router.refresh();
      } else {
        toast("Sync failed — check WhatsApp connection", { variant: "error" });
      }
    } catch {
      toast("Sync failed", { variant: "error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => void handleSync()} disabled={syncing}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {syncing ? "Syncing…" : "Sync from Meta"}
      </Button>
      <Toast title={toastState.title} variant={toastState.variant} open={toastState.open} onOpenChange={setToastOpen} />
    </>
  );
}
