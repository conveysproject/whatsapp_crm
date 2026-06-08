"use client";

import { type JSX } from "react";
import Link from "next/link";
import { EmbeddedSignupButton } from "@/components/whatsapp/EmbeddedSignupButton";

export default function ConnectWabaPage(): JSX.Element {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
      <p className="text-sm text-gray-500 mb-6">
        A guided setup will open — connect your WhatsApp Business Account and phone number in one
        flow.
      </p>
      <EmbeddedSignupButton
        flow="onboarding"
        onSuccess={() => undefined}
        onError={() => undefined}
      />
      <p className="mt-4 text-center text-xs text-gray-400">
        Already connected?{" "}
        <Link href="/checklist" className="text-green-600 hover:underline">
          Skip to checklist
        </Link>
      </p>
    </div>
  );
}
