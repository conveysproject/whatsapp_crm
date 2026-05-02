"use client";

import { JSX, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useOnboardingStatus } from "@/app/(dashboard)/onboarding-context";

interface WhatsAppGateProps {
  feature: "Inbox" | "Campaigns";
  children: ReactNode;
}

export function WhatsAppGate({ feature, children }: WhatsAppGateProps): JSX.Element {
  const { wabaConnected } = useOnboardingStatus();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (wabaConnected) return <>{children}</>;

  if (feature === "Campaigns" && dismissed) return <>{children}</>;

  return (
    <div className="flex-1 relative overflow-hidden min-h-0">
      <div className="absolute inset-0 pointer-events-none select-none opacity-30 blur-sm overflow-hidden">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 backdrop-blur-[2px]">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-sm w-full mx-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-green-500" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.562 4.14 1.541 5.877L.057 23.57a.75.75 0 00.916.919l5.765-1.498A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.698-.5-5.254-1.375l-.372-.214-3.852 1.001 1.026-3.748-.235-.386A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Connect WhatsApp to use {feature}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Link your WhatsApp Business Account to start messaging your contacts.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push("/connect-waba")}>
              Connect WhatsApp
            </Button>
            {feature === "Campaigns" && (
              <Button variant="ghost" onClick={() => setDismissed(true)}>
                Maybe later
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
