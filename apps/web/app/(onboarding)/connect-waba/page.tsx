"use client";

import { useState, useEffect, useRef, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

declare global {
  interface Window {
    FB: {
      init: (params: object) => void;
      login: (
        callback: (response: { authResponse?: { code: string } }) => void,
        params: object
      ) => void;
    };
    fbAsyncInit: () => void;
    launchWhatsAppSignup: () => void;
  }
}

export default function ConnectWabaPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);

  // Captured from the WA_EMBEDDED_SIGNUP FINISH event
  const sessionRef = useRef<{ phoneNumberId: string; wabaId: string }>({
    phoneNumberId: "",
    wabaId: "",
  });

  useEffect(() => {
    // Listen for ALL messages from the popup to capture session info and debug
    const sessionInfoListener = (event: MessageEvent) => {
      console.log("[WA Signup] postMessage received:", event.origin, event.data);
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          event?: string;
          data?: { phone_number_id?: string; waba_id?: string };
        };
        console.log("[WA Signup] Parsed postMessage:", JSON.stringify(data));
        if (data.type === "WA_EMBEDDED_SIGNUP") {
          console.log("[WA Signup] Embedded signup event:", data.event, "data:", JSON.stringify(data.data));
          if (data.event === "FINISH") {
            sessionRef.current = {
              phoneNumberId: data.data?.phone_number_id ?? "",
              wabaId: data.data?.waba_id ?? "",
            };
            console.log("[WA Signup] FINISH captured — phoneNumberId:", sessionRef.current.phoneNumberId, "wabaId:", sessionRef.current.wabaId);
          }
        }
      } catch {
        // non-JSON message — ignore
      }
    };

    window.addEventListener("message", sessionInfoListener);
    return () => window.removeEventListener("message", sessionInfoListener);
  }, []);

  useEffect(() => {
    window.fbAsyncInit = function () {
      console.log("[WA Signup] FB SDK loaded, initialising with appId:", APP_ID);
      window.FB.init({
        appId: APP_ID,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v22.0",
      });
      console.log("[WA Signup] FB.init() done — SDK ready");
      setSdkReady(true);
    };
  }, []);

  async function handleConnect(): Promise<void> {
    if (!sdkReady) return;
    setStatus("loading");
    setErrorMsg(null);
    sessionRef.current = { phoneNumberId: "", wabaId: "" };

    console.log("[WA Signup] Button clicked — APP_ID:", APP_ID, "CONFIG_ID:", CONFIG_ID, "API_URL:", API_URL);
    console.log("[WA Signup] Calling FB.login() with config_id:", CONFIG_ID);

    window.FB.login(
      (response) => {
        console.log("[WA Signup] FB.login callback fired — full response:", JSON.stringify(response));

        if (!response.authResponse?.code) {
          console.warn("[WA Signup] No code in authResponse — user cancelled or popup blocked");
          setStatus("error");
          setErrorMsg("Connection cancelled or failed. Please try again.");
          return;
        }

        console.log("[WA Signup] Got code (first 10 chars):", response.authResponse.code.slice(0, 10), "...");
        console.log("[WA Signup] Session at callback — phoneNumberId:", sessionRef.current.phoneNumberId, "wabaId:", sessionRef.current.wabaId);

        void (async () => {
          try {
            console.log("[WA Signup] Getting Clerk token...");
            const token = await getToken();
            console.log("[WA Signup] Token obtained:", token ? "yes" : "MISSING");

            const payload = {
              code: response.authResponse!.code,
              embedded: true,
              phoneNumberId: sessionRef.current.phoneNumberId,
              wabaId: sessionRef.current.wabaId,
            };
            console.log("[WA Signup] POSTing to", `${API_URL}/v1/onboarding/waba-callback`, "payload:", JSON.stringify({ ...payload, code: payload.code.slice(0, 10) + "..." }));

            const res = await fetch(`${API_URL}/v1/onboarding/waba-callback`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token ?? ""}`,
              },
              body: JSON.stringify(payload),
            });

            console.log("[WA Signup] API response status:", res.status, res.statusText);

            if (res.ok) {
              const hasPhone = !!sessionRef.current.phoneNumberId;
              const dest = hasPhone ? "/invite-team" : "/provision-number";
              console.log("[WA Signup] Success! hasPhone:", hasPhone, "→ redirecting to:", dest);
              router.replace(dest);
            } else {
              const body = await res.json().catch(() => ({})) as {
                error?: { message?: string } | string;
                detail?: { error?: { message?: string } };
              };
              console.error("[WA Signup] API error body:", JSON.stringify(body));
              const msg =
                body?.detail?.error?.message ??
                (typeof body?.error === "string" ? body.error : (body?.error as { message?: string })?.message) ??
                "Server error. Please try again.";
              setErrorMsg(msg);
              setStatus("error");
            }
          } catch (err) {
            console.error("[WA Signup] Network/fetch error:", err);
            setErrorMsg("Network error. Please try again.");
            setStatus("error");
          }
        })();
      },
      {
        config_id: CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: { sessionInfoVersion: 2, setup: {} },
      }
    );
  }

  if (!APP_ID || !CONFIG_ID) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Meta configuration incomplete</p>
          <p className="text-xs text-yellow-700 mt-1">
            Set{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_APP_ID</code> and{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_CONFIG_ID</code> in your
            environment variables.
          </p>
        </div>
        <Link
          href="/checklist"
          className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          Back to checklist
        </Link>
      </div>
    );
  }

  return (
    <>
      <Script src="https://connect.facebook.net/en_US/sdk.js" strategy="afterInteractive" />
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <p className="text-sm text-gray-500 mb-6">
          A guided setup will open in a popup — connect your WhatsApp Business Account and phone
          number in one flow.
        </p>

        {status === "error" && errorMsg && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
            <p className="text-sm text-red-600">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={() => { void handleConnect(); }}
          disabled={status === "loading" || !sdkReady}
          className="block w-full text-center bg-[#1877F2] hover:bg-[#166fe5] disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          {status === "loading" ? "Connecting…" : !sdkReady ? "Loading…" : "Connect with Meta"}
        </button>

        <p className="mt-4 text-center text-xs text-gray-400">
          Already connected?{" "}
          <Link href="/checklist" className="text-green-600 hover:underline">
            Skip to checklist
          </Link>
        </p>
      </div>
    </>
  );
}
