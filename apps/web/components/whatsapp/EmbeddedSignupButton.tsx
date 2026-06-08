"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: { appId: string; version: string }) => void;
      login: (callback: (response: FBAuthResponse) => void, options: FBLoginOptions) => void;
    };
  }
}

interface FBAuthResponse {
  authResponse?: { code?: string };
  status?: string;
}

interface FBLoginOptions {
  config_id: string;
  response_type: string;
  override_default_response_type: boolean;
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
}

type SignupState = "idle" | "connecting" | "success" | "error";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const SMB_CONFIG_ID = process.env["NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID"] ?? "";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function EmbeddedSignupButton({ flow, onSuccess, onError }: EmbeddedSignupButtonProps): JSX.Element {
  const router = useRouter();
  const { getToken } = useAuth();
  const [state, setState] = useState<SignupState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSMB, setIsSMB] = useState(false);
  const [fbReady, setFbReady] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);

  const wabaIdRef = useRef("");
  const phoneNumberIdRef = useRef("");

  useEffect(() => {
    if (document.getElementById("facebook-jssdk")) {
      if (window.FB) setFbReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, version: "v25.0" });
      setFbReady(true);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  async function handleConnect(): Promise<void> {
    if (!window.FB) return;
    setState("connecting");
    wabaIdRef.current = "";
    phoneNumberIdRef.current = "";

    function onPostMessage(event: MessageEvent): void {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = (typeof event.data === "string" ? JSON.parse(event.data) : event.data) as {
          type?: string;
          event?: string;
          data?: { waba_id?: string; phone_number_id?: string };
        };
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          wabaIdRef.current = data.data?.waba_id ?? "";
          phoneNumberIdRef.current = data.data?.phone_number_id ?? "";
        }
      } catch {
        // ignore malformed messages
      }
    }
    window.addEventListener("message", onPostMessage);

    const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;

    window.FB.login(async (response: FBAuthResponse) => {
      window.removeEventListener("message", onPostMessage);
      const code = response.authResponse?.code;
      if (!code) {
        setState("idle");
        return;
      }

      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({
            code,
            wabaId: wabaIdRef.current || undefined,
            phoneNumberId: phoneNumberIdRef.current || undefined,
            isSMB,
            flow,
          }),
        });

        const body = await res.json() as { data?: ConnectResult; error?: { message?: string } };
        if (!res.ok) {
          const msg = body.error?.message ?? `Error ${res.status}`;
          setErrorMessage(msg);
          setState("error");
          onError(msg);
          return;
        }

        const connectResult = body.data!;
        setResult(connectResult);
        setState("success");
        onSuccess(connectResult);

        if (flow === "onboarding") {
          setTimeout(() => {
            router.replace(connectResult.phoneNumberId ? "/checklist" : "/provision-number");
          }, 1500);
        }
      } catch {
        const msg = "Network error. Please try again.";
        setErrorMessage(msg);
        setState("error");
        onError(msg);
      }
    }, { config_id: configId, response_type: "code", override_default_response_type: true });
  }

  if (state === "success" && result) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="flex items-center gap-2 text-green-600">
          <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">{result.wabaName || "Connected"}</span>
        </div>
        {result.displayPhoneNumber && (
          <p className="text-sm text-gray-500">{result.displayPhoneNumber}</p>
        )}
        {flow === "onboarding" ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>Redirecting…</span>
          </div>
        ) : (
          <p className="text-sm text-green-600 font-medium">Connected!</p>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700 mb-3">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-sm text-red-600 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state === "connecting") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-6 h-6 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm text-gray-600">Connecting your WhatsApp account…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {SMB_CONFIG_ID && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSMB}
            onChange={(e) => setIsSMB(e.target.checked)}
            className="rounded border-gray-300"
          />
          I already use the WhatsApp Business App
        </label>
      )}
      <button
        type="button"
        onClick={() => void handleConnect()}
        disabled={!fbReady}
        className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        Connect with Meta
      </button>
    </div>
  );
}
