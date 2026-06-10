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
      // ── STEP 1: environment ────────────────────────────────────────────────
      console.group("[WA-CONNECT] 1. Environment");
      console.log("page origin        :", window.location.origin);
      console.log("page href          :", window.location.href);
      console.log("APP_ID             :", APP_ID);
      console.log("CONFIG_ID          :", CONFIG_ID);
      console.log("SMB_CONFIG_ID      :", SMB_CONFIG_ID);
      console.log("API_URL            :", API_URL);
      console.log("isSMB              :", isSMB);
      console.log("flow               :", flow);
      console.groupEnd();

      // ── STEP 2: load FB SDK ────────────────────────────────────────────────
      console.group("[WA-CONNECT] 2. Load FB SDK");
      try {
        await loadFBSDK(APP_ID);
        console.log("FB SDK loaded OK, window.FB:", !!window.FB);
      } catch (e) {
        console.error("FB SDK load FAILED:", e);
        console.groupEnd();
        setLoading(false);
        onError("Failed to load Facebook SDK. Please try again.");
        return;
      }
      console.groupEnd();

      const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;

      // ── STEP 3: FB.login params ────────────────────────────────────────────
      const fbLoginParams = {
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
      };
      console.group("[WA-CONNECT] 3. FB.login params");
      console.log(JSON.stringify(fbLoginParams, null, 2));
      console.groupEnd();

      let phoneNumberId = "";
      let wabaId = "";
      let capturedRedirectUri = "";

      // ── STEP 4: postMessage listener ──────────────────────────────────────
      const sessionInfoListener = (event: MessageEvent) => {
        console.group("[WA-CONNECT] 4. postMessage event");
        console.log("event.origin :", event.origin);
        console.log("event.data   :", event.data);
        if (event.origin !== "https://www.facebook.com") {
          console.log("→ IGNORED (origin mismatch — expected https://www.facebook.com)");
          console.groupEnd();
          return;
        }
        const raw = event.data as string;
        // xd_arbiter relay messages are URL-encoded query strings, not JSON — skip silently
        if (typeof raw !== "string" || raw.startsWith("cb=") || !raw.startsWith("{")) {
          console.log("→ non-JSON (xd_arbiter relay), skipped");
          console.groupEnd();
          return;
        }
        try {
          const data = JSON.parse(raw) as {
            type?: string;
            event?: string;
            data?: { phone_number_id?: string; waba_id?: string; current_step?: string };
          };
          console.log("parsed:", JSON.stringify(data, null, 2));
          if (data.type === "WA_EMBEDDED_SIGNUP") {
            if (data.event === "FINISH" || data.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING") {
              phoneNumberId = data.data?.phone_number_id ?? "";
              wabaId = data.data?.waba_id ?? "";
              console.log("→ FINISH captured — phoneNumberId:", phoneNumberId, "wabaId:", wabaId);
            } else {
              console.log("→ event type:", data.event, "current_step:", data.data?.current_step);
            }
          }
        } catch (e) {
          console.log("→ unexpected non-JSON:", e);
        }
        console.groupEnd();
      };
      window.addEventListener("message", sessionInfoListener);
      console.log("[WA-CONNECT] postMessage listener registered");

      // ── STEP 5: FB.login call ──────────────────────────────────────────────
      // Intercept window.open to capture the xd_arbiter redirect_uri Meta uses internally.
      // FB.login calls window.open synchronously, so we restore immediately after.
      const originalOpen = window.open;
      window.open = function (url?: string | URL, target?: string, features?: string): WindowProxy | null {
        if (typeof url === "string" && url.includes("facebook.com") && url.includes("redirect_uri")) {
          try {
            const ru = new URL(url).searchParams.get("redirect_uri");
            if (ru) {
              capturedRedirectUri = ru;
              console.log("[WA-CONNECT] captured redirect_uri:", capturedRedirectUri.slice(0, 80) + "…");
            }
          } catch { /* ignore */ }
        }
        return originalOpen.call(window, url as string, target, features);
      };
      console.log("[WA-CONNECT] 5. Calling FB.login …");
      window.FB!.login(
        (response) => {
          // ── STEP 6: FB.login callback ──────────────────────────────────────
          console.group("[WA-CONNECT] 6. FB.login callback");
          console.log("raw response      :", JSON.stringify(response, null, 2));
          console.log("authResponse      :", JSON.stringify(response.authResponse, null, 2));
          console.log("status            :", response.status);
          console.log("code              :", response.authResponse?.code ? `${response.authResponse.code.slice(0, 20)}…` : "MISSING");
          console.log("wabaId (message)  :", wabaId);
          console.log("phoneNumberId (message):", phoneNumberId);
          console.groupEnd();

          const code = response.authResponse?.code;
          if (!code) {
            setLoading(false);
            onError("Connection was cancelled.");
            return;
          }
          void (async () => {
            try {
              const token = await getToken();
              const requestBody = { code, isSMB, flow, wabaId: wabaId || undefined, phoneNumberId: phoneNumberId || undefined, redirectUri: capturedRedirectUri || undefined };

              // ── STEP 7: API request ──────────────────────────────────────
              console.group("[WA-CONNECT] 7. POST /v1/whatsapp-account/connect");
              console.log("URL    :", `${API_URL}/v1/whatsapp-account/connect`);
              console.log("body   :", JSON.stringify(requestBody, null, 2));
              console.log("token  :", token ? `${token.slice(0, 20)}…` : "MISSING");
              console.groupEnd();

              const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token ?? ""}`,
                },
                body: JSON.stringify(requestBody),
              });
              const body = await res.json() as {
                data?: ConnectResult;
                error?: { message?: string };
              };

              // ── STEP 8: API response ─────────────────────────────────────
              console.group("[WA-CONNECT] 8. API response");
              console.log("status :", res.status, res.statusText);
              console.log("body   :", JSON.stringify(body, null, 2));
              console.groupEnd();

              if (!res.ok) {
                onError(body.error?.message ?? `Error ${res.status}`);
                return;
              }
              onSuccess(body.data!);
            } catch (e) {
              console.error("[WA-CONNECT] Network error:", e);
              onError("Network error — please try again.");
            } finally {
              window.removeEventListener("message", sessionInfoListener);
              setLoading(false);
            }
          })();
        },
        fbLoginParams
      );
      // FB.login already opened the popup synchronously — restore window.open immediately
      window.open = originalOpen;
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
