"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { JSX } from "react";

export default function WabaCallbackPage(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    const code = params.get("code");
    if (!code) { setStatus("error"); return; }

    fetch("/api/onboarding/waba-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => {
        if (r.ok) router.replace("/onboarding/provision-number");
        else setStatus("error");
      })
      .catch(() => setStatus("error"));
  }, [params, router]);

  if (status === "error") {
    return (
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
        <a href="/onboarding/connect-waba" className="text-green-600 hover:underline text-sm">
          Back
        </a>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4" />
      <p className="text-gray-500 text-sm">Connecting your WhatsApp account&hellip;</p>
    </div>
  );
}
