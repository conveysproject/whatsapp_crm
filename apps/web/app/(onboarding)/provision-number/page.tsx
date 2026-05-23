"use client";

import { useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function ProvisionNumberPage(): JSX.Element {
  const router = useRouter();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);

  async function handleReady(): Promise<void> {
    setLoading(true);
    try {
      const token = await getToken();
      await fetch(`${API_URL}/v1/onboarding/sync-phone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
    } finally {
      router.push("/checklist");
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Provision Phone Number</h2>
      <p className="text-sm text-gray-500 mb-6">
        Your WhatsApp Business Account is connected. Next, add and verify a phone number in the Meta
        Business Manager, then return here.
      </p>
      <a
        href="https://business.facebook.com/wa/manage/phone-numbers/"
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors mb-3"
      >
        Open Meta Business Manager
      </a>
      <button
        onClick={() => void handleReady()}
        disabled={loading}
        className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
      >
        {loading ? "Syncing…" : "Number is ready — continue"}
      </button>
    </div>
  );
}
