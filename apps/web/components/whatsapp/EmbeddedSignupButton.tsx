"use client";

import { useState, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; version: string; xfbml: boolean; autoLogAppEvents: boolean }) => void;
      login: (callback: (response: FBLoginResponse) => void, params: FBLoginParams) => void;
    };
  }
}

interface FBLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FBLoginParams {
  config_id: string;
  response_type: string;
  override_default_response_type: boolean;
  extras: Record<string, unknown>;
}

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
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

function loadFBSDK(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) { resolve(); return; }
    window.fbAsyncInit = function () {
      window.FB!.init({ appId, version: "v25.0", xfbml: false, autoLogAppEvents: true });
      resolve();
    };
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  });
}

export function EmbeddedSignupButton({ flow, isSMB: isSMBProp, onSuccess, onError }: EmbeddedSignupButtonProps): JSX.Element {
  const { getToken } = useAuth();
  const [isSMBInternal, setIsSMBInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSMB = isSMBProp !== undefined ? isSMBProp : isSMBInternal;

  function handleConnect(): void {
    setLoading(true);
    void (async () => {
      try {
        await loadFBSDK(APP_ID);
      } catch {
        setLoading(false);
        onError("Failed to load Facebook SDK. Please try again.");
        return;
      }

      const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;

      let phoneNumberId = "";
      let wabaId = "";

      const sessionInfoListener = (event: MessageEvent) => {
        if (event.origin !== "https://www.facebook.com") return;
        try {
          const data = JSON.parse(event.data as string) as {
            type?: string;
            event?: string;
            data?: { phone_number_id?: string; waba_id?: string; current_step?: string };
          };
          if (data.type === "WA_EMBEDDED_SIGNUP") {
            if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
              phoneNumberId = data.data?.phone_number_id ?? "";
              wabaId = data.data?.waba_id ?? "";
            }
          }
        } catch {
          // non-JSON message — ignore
        }
      };
      window.addEventListener("message", sessionInfoListener);

      window.FB!.login(
        (response) => {
          window.removeEventListener("message", sessionInfoListener);
          const code = response.authResponse?.code;
          if (!code) {
            setLoading(false);
            onError("Connection was cancelled.");
            return;
          }
          void (async () => {
            try {
              const token = await getToken();
              const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token ?? ""}`,
                },
                body: JSON.stringify({ code, isSMB, flow, wabaId: wabaId || undefined, phoneNumberId: phoneNumberId || undefined }),
              });
              const body = await res.json() as {
                data?: ConnectResult;
                error?: { message?: string };
              };
              if (!res.ok) {
                onError(body.error?.message ?? `Error ${res.status}`);
                return;
              }
              onSuccess(body.data!);
            } catch {
              onError("Network error — please try again.");
            } finally {
              setLoading(false);
            }
          })();
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: isSMB ? "whatsapp_business_app_onboarding" : "",
            sessionInfoVersion: "3",
            features: [{ name: "marketing_messages_lite" }],
            version: "v3",
          },
        }
      );
    })();
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
        disabled={loading}
        className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-60"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            Connecting…
          </>
        ) : (
          <>
            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Connect with Meta
          </>
        )}
      </button>
    </div>
  );
}
