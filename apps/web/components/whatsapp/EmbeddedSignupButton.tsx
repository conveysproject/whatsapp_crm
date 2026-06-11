"use client";

import { useEffect, useRef, useState, type JSX } from "react";
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
  metaBusinessId: string | null;
  facebookPageIds: string[];
  instagramAccountIds: string[];
}

export interface EmbeddedSignupButtonProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onError: (message: string) => void;
  isSMB?: boolean;
}

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const SMB_CONFIG_ID = process.env["NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID"] ?? "";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

// Module-level coordination: postMessage and FB.login callback race each other.
// WA_EMBEDDED_SIGNUP fires when user clicks Finish; FB.login callback fires when
// the popup window closes. In practice postMessage always fires first, but we
// coordinate with outer vars so the API call fires only when both are available.
interface SessionData {
  wabaId: string;
  phoneNumberId: string;
  businessId: string;
  pageIds: string[];
  instagramAccountIds: string[];
}
let sessionDataOuter: SessionData | null = null;
let codeOuter: string | null = null;

function loadFBSDK(appId: string): Promise<void> {
  return new Promise((resolve) => {
    if (window.FB) { resolve(); return; }
    window.fbAsyncInit = function () {
      window.FB!.init({ appId, version: "v24.0", xfbml: false, autoLogAppEvents: true });
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

export function EmbeddedSignupButton({
  flow,
  isSMB: isSMBProp,
  onSuccess,
  onError,
}: EmbeddedSignupButtonProps): JSX.Element {
  const { getToken } = useAuth();
  const [isSMBInternal, setIsSMBInternal] = useState(false);
  const [loading, setLoading] = useState(false);
  const isSMB = isSMBProp !== undefined ? isSMBProp : isSMBInternal;

  const esInProgressRef = useRef(false);
  const popupWindowRef = useRef<Window | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Always-current API call function — assign on every render so it captures
  // the latest isSMB, flow, onSuccess, onError without stale closures.
  const callApiRef = useRef<((code: string, sd: SessionData) => Promise<void>) | null>(null);
  callApiRef.current = async (code: string, sd: SessionData): Promise<void> => {
    try {
      const token = await getToken();
      const body = {
        code,
        isSMB,
        flow,
        ...(sd.wabaId ? { wabaId: sd.wabaId } : {}),
        ...(sd.phoneNumberId ? { phoneNumberId: sd.phoneNumberId } : {}),
        ...(sd.businessId ? { businessId: sd.businessId } : {}),
        ...(sd.pageIds.length > 0 ? { pageIds: sd.pageIds } : {}),
        ...(sd.instagramAccountIds.length > 0 ? { instagramAccountIds: sd.instagramAccountIds } : {}),
      };
      const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: ConnectResult; error?: { message?: string } };
      if (!res.ok) {
        onError(json.error?.message ?? `Error ${res.status}`);
        return;
      }
      onSuccess(json.data!);
    } catch {
      onError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Register the postMessage listener for the entire component lifetime.
  // This must live in useEffect so it is cleaned up on unmount.
  useEffect(() => {
    void loadFBSDK(APP_ID);

    const stopPolling = () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const cb = (event: MessageEvent) => {
      // Reference pattern: accept any *.facebook.com origin, not just www
      if (!event.origin.endsWith("facebook.com")) return;
      const raw = event.data as string;
      if (typeof raw !== "string" || !raw.startsWith("{")) return;
      try {
        const data = JSON.parse(raw) as {
          type?: string;
          data?: {
            waba_id?: string;
            phone_number_id?: string;
            business_id?: string;
            page_ids?: string[];
            instagram_account_ids?: string[];
            current_step?: string;
          };
        };
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.data?.current_step) {
            // User closed the popup mid-flow — clear state, stop polling
            esInProgressRef.current = false;
            popupWindowRef.current = null;
            stopPolling();
          } else {
            // Flow complete — capture all channel data
            sessionDataOuter = {
              wabaId: data.data?.waba_id ?? "",
              phoneNumberId: data.data?.phone_number_id ?? "",
              businessId: data.data?.business_id ?? "",
              pageIds: data.data?.page_ids ?? [],
              instagramAccountIds: data.data?.instagram_account_ids ?? [],
            };
            // If FB.login callback already fired, proceed immediately
            if (codeOuter) void callApiRef.current?.(codeOuter, sessionDataOuter);
          }
        }
      } catch {
        // Non-JSON or non-ES messages from Facebook iframes — ignore
      }
    };

    window.addEventListener("message", cb);
    return () => {
      window.removeEventListener("message", cb);
      stopPolling();
    };
  }, []); // empty deps — refs and module-level vars never change identity

  function handleConnect(): void {
    setLoading(true);
    // Reset coordination state for this attempt
    sessionDataOuter = null;
    codeOuter = null;
    esInProgressRef.current = true;
    popupWindowRef.current = null;

    if (!window.FB) {
      setLoading(false);
      onError("Facebook SDK is still loading. Please try again in a moment.");
      return;
    }

    const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;

    // v4 config — key changes from v3:
    //   version: "v4" (was "v3")
    //   features: ["app_only_install"] (was ["marketing_messages_lite"])
    //   featureType: omitted entirely when not SMB (reference deletes empty featureType)
    //   setup: {} removed (not present in Meta reference)
    const fbLoginParams: FBLoginParams = {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        sessionInfoVersion: "3",
        version: "v4",
        ...(isSMB ? { featureType: "whatsapp_business_app_onboarding" } : {}),
        features: [{ name: "app_only_install" }],
      },
    };

    // Capture the popup window reference. FB.login opens the popup synchronously
    // before invoking any callback, so we intercept window.open briefly.
    const originalWindowOpen = window.open;
    window.open = function (...args: Parameters<typeof window.open>): Window | null {
      const popup = originalWindowOpen.apply(window, args);
      if (popup) popupWindowRef.current = popup;
      window.open = originalWindowOpen; // restore immediately
      return popup;
    };

    window.FB.login((response) => {
      // Popup has closed — clear ES in-progress state and polling
      esInProgressRef.current = false;
      popupWindowRef.current = null;
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      if (response.authResponse?.code) {
        codeOuter = response.authResponse.code;
        if (sessionDataOuter) {
          // postMessage already arrived — fire API immediately
          void callApiRef.current?.(codeOuter, sessionDataOuter);
        }
        // else: postMessage handler will call callApiRef when WA_EMBEDDED_SIGNUP arrives
      } else {
        // User cancelled the dialog
        sessionDataOuter = null;
        codeOuter = null;
        setLoading(false);
        onError("Connection was cancelled.");
      }
    }, fbLoginParams);

    // Poll every 500ms to detect external popup close (user closed without completing)
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollTimerRef.current = setInterval(() => {
      if (!esInProgressRef.current) {
        clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        return;
      }
      if (popupWindowRef.current?.closed) {
        esInProgressRef.current = false;
        popupWindowRef.current = null;
        clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        setLoading(false);
      }
    }, 500);
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
            <span
              className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
              aria-hidden="true"
            />
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
