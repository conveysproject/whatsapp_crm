"use client";

import { type JSX } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectWhatsAppModal, type ConnectResult } from "@/components/whatsapp/ConnectWhatsAppModal";

export default function ConnectWabaPage(): JSX.Element {
  const router = useRouter();

  function handleSuccess(result: ConnectResult): void {
    router.replace(result.phoneNumberId ? "/checklist" : "/provision-number");
  }

  return (
    <div>
      <ConnectWhatsAppModal
        flow="onboarding"
        variant="inline"
        onSuccess={handleSuccess}
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
