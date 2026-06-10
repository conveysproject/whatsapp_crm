"use client";

import { useState, type JSX } from "react";

export interface ConnectResult {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}

export interface EmbeddedSignupButtonProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onError: (message: string) => void;
  /** When provided the internal checkbox is hidden and this value is used directly */
  isSMB?: boolean;
}

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const SMB_CONFIG_ID = process.env["NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID"] ?? "";
const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "https://wbmsg.com/connect-waba/callback";

// Redirects to Meta's OAuth dialog with an explicit redirect_uri.
// onSuccess/onError are no-ops here — the callback page at REDIRECT_URI handles them.
export function EmbeddedSignupButton({ flow, isSMB: isSMBProp }: EmbeddedSignupButtonProps): JSX.Element {
  const [isSMBInternal, setIsSMBInternal] = useState(false);
  const isSMB = isSMBProp !== undefined ? isSMBProp : isSMBInternal;

  function handleConnect(): void {
    const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;
    const params = new URLSearchParams({
      client_id: APP_ID,
      config_id: configId,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      state: JSON.stringify({ flow, isSMB }),
    });
    window.location.href = `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-4">
      {SMB_CONFIG_ID && isSMBProp === undefined && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSMBInternal}
            onChange={(e) => setIsSMBInternal(e.target.checked)}
            className="rounded border-gray-300"
          />
          I already use the WhatsApp Business App
        </label>
      )}
      <button
        type="button"
        onClick={handleConnect}
        className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        Connect with Meta
      </button>
    </div>
  );
}
