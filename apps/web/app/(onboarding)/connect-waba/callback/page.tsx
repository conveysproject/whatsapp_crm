"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { JSX } from "react";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function WabaCallbackPage(): JSX.Element {
  const params = useSearchParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    const code = params.get("code");
    if (!code) { setStatus("error"); return; }

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/onboarding/waba-callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token ?? ""}`,
          },
          body: JSON.stringify({ code }),
        });
        if (res.ok) {
          router.replace("/provision-number");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    })();
  }, [params, router, getToken]);

  if (status === "error") {
    return (
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
        <a href="/connect-waba" className="text-green-600 hover:underline text-sm">
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
