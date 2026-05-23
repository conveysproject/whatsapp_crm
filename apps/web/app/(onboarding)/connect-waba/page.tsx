"use client";

import { type JSX } from "react";
import Link from "next/link";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "";

export default function ConnectWabaPage(): JSX.Element {
  function handleConnect(): void {
    if (!APP_ID || !CONFIG_ID || !REDIRECT_URI) return;
    const params = new URLSearchParams({
      client_id: APP_ID,
      config_id: CONFIG_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      override_default_response_type: "true",
    });
    window.location.href = `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`;
  }

  if (!APP_ID || !CONFIG_ID || !REDIRECT_URI) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Meta configuration incomplete</p>
          <p className="text-xs text-yellow-700 mt-1">
            Set{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_APP_ID</code>,{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_CONFIG_ID</code>, and{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_REDIRECT_URI</code> in
            your environment variables.
          </p>
        </div>
        <Link
          href="/checklist"
          className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          Skip to checklist
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
      <p className="text-sm text-gray-500 mb-6">
        A guided setup will open — connect your WhatsApp Business Account and phone number in one
        flow.
      </p>
      <button
        onClick={handleConnect}
        className="block w-full text-center bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        Connect with Meta
      </button>
      <p className="mt-4 text-center text-xs text-gray-400">
        Already connected?{" "}
        <Link href="/checklist" className="text-green-600 hover:underline">
          Skip to checklist
        </Link>
      </p>
    </div>
  );
}
