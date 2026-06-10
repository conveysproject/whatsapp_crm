"use client";

import { type JSX } from "react";
import Link from "next/link";
import { ConnectWhatsAppModal } from "@/components/whatsapp/ConnectWhatsAppModal";

export default function ConnectWabaPage(): JSX.Element {
  return (
    <div>
      <ConnectWhatsAppModal
        flow="onboarding"
        variant="inline"
        onSuccess={() => undefined}
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
