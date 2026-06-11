"use client";

import { useState, type JSX, type ChangeEvent } from "react";
import { EmbeddedSignupButton, type ConnectResult } from "./EmbeddedSignupButton";
export type { ConnectResult };

interface ConnectWhatsAppModalProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  /** Required in modal variant; omit for inline */
  onClose?: () => void;
  /** "modal" (default) renders as a fixed overlay; "inline" renders flat on the page */
  variant?: "modal" | "inline";
}

type Step = "choose" | "connect";

export function ConnectWhatsAppModal({ flow, onSuccess, onClose, variant = "modal" }: ConnectWhatsAppModalProps): JSX.Element {
  const [step, setStep] = useState<Step>("choose");
  const [isSMB, setIsSMB] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function handleChoose(smb: boolean): void {
    setIsSMB(smb);
    setStep("connect");
  }

  const inner = (
    <div className={variant === "modal" ? `bg-white rounded-2xl shadow-2xl w-full ${step === "choose" ? "max-w-3xl" : "max-w-xl"}` : "w-full"}>
      {/* Header */}
      <div className={`flex items-center justify-between ${variant === "modal" ? "px-6 pt-6 pb-4 border-b" : "pb-3 border-b"}`}>
        <h2 className="text-lg font-semibold text-gray-900">
          {step === "choose" ? "Set up WhatsApp API Number" : "Connect your WhatsApp"}
        </h2>
        {variant === "modal" && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {step === "choose" ? (
        <ChooseStep onChoose={handleChoose} />
      ) : (
        <ConnectStep
          flow={flow}
          isSMB={isSMB}
          errorMsg={errorMsg}
          onBack={() => { setStep("choose"); setErrorMsg(""); }}
          onSuccess={onSuccess}
          onError={setErrorMsg}
        />
      )}
    </div>
  );

  if (variant === "inline") return inner;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      {inner}
    </div>
  );
}

function ChooseStep({ onChoose }: { onChoose: (smb: boolean) => void }): JSX.Element {
  const [hasAppVersion, setHasAppVersion] = useState(false);
  const [hasVerification, setHasVerification] = useState(false);
  const smbReady = hasAppVersion && hasVerification;

  return (
    <div className="py-5 space-y-4">
      <p className="text-sm text-gray-500">Choose how you want to connect your WhatsApp number to WBMSG.</p>
      <div className="grid grid-cols-2 gap-4">
        {/* WA Business App Number */}
        <div className="border-2 border-purple-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-purple-600 px-5 py-3">
            <p className="text-white font-semibold">WA Business App Number</p>
            <p className="text-purple-200 text-xs mt-0.5">Already using the WhatsApp Business app</p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3 flex-1">
            <div className="space-y-0 divide-y divide-gray-100 text-sm">
              <div className="py-2 flex gap-3">
                <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide w-28 shrink-0 pt-0.5">Requirements</span>
                <div className="flex flex-col gap-2 text-xs min-w-0">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasAppVersion}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHasAppVersion(e.target.checked)}
                      className="mt-0.5 accent-purple-600"
                    />
                    <span>My WA Business App is <strong>version 2.24.4 or higher</strong></span>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasVerification}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setHasVerification(e.target.checked)}
                      className="mt-0.5 accent-purple-600"
                    />
                    <span>I have a <strong>GST Certificate</strong> or <strong>Active Website</strong> ready for Meta verification</span>
                  </label>
                </div>
              </div>
              <InfoRow label="Number">
                No new number needed — use your existing WA Business App number
              </InfoRow>
              <InfoRow label="App Usage">
                <span>Continue using WA Business App alongside WBMSG</span>
                <span className="text-gray-400">Messages sync between WBMSG &amp; app</span>
              </InfoRow>
              <InfoRow label="Broadcasts">
                <span className="text-orange-600 font-medium">Slower speeds</span>
                <span className="text-gray-400">10,000 contacts could take ~1 hour to send</span>
              </InfoRow>
              <InfoRow label="Catalog">
                <span>Must be created in WhatsApp app</span>
                <span className="text-gray-400">No API/CSV import · No Shopify sync</span>
              </InfoRow>
              <InfoRow label="Automations">
                Chatbots &amp; AI Agent available for customer replies
              </InfoRow>
              <InfoRow label="Groups / Status / Calling">
                <span>Groups, Status &amp; Calling available on WA Business App</span>
                <span className="text-gray-400">WA Calling not possible from WBMSG</span>
              </InfoRow>
              <InfoRow label="Display Name">
                <span>Depends on contact saving</span>
                <span className="text-gray-400">Customers see your name only if they saved your number</span>
              </InfoRow>
            </div>
            <button
              type="button"
              onClick={() => onChoose(true)}
              disabled={!smbReady}
              className="mt-auto w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {smbReady ? "Proceed" : "Confirm requirements above"}
            </button>
          </div>
        </div>

        {/* New Number */}
        <div className="border-2 border-blue-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-[#1877F2] px-5 py-3">
            <p className="text-white font-semibold">New / Dedicated Number</p>
            <p className="text-blue-200 text-xs mt-0.5">Register any number via Meta</p>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3 flex-1">
            <ul className="space-y-2 text-sm text-gray-600">
              <FeatureItem>Any new or existing SIM number</FeatureItem>
              <FeatureItem>Full Cloud API access from day one</FeatureItem>
              <FeatureItem>Verified business display name</FeatureItem>
            </ul>
            <button
              type="button"
              onClick={() => onChoose(false)}
              className="mt-auto w-full py-2 bg-[#1877F2] hover:bg-[#166fe5] text-white text-sm font-medium rounded-lg transition-colors"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="py-2 flex gap-3">
      <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide w-28 shrink-0 pt-0.5">{label}</span>
      <div className="flex flex-col gap-0.5 text-xs text-gray-700 min-w-0">{children}</div>
    </div>
  );
}

function FeatureItem({ children, muted = false }: { children: React.ReactNode; muted?: boolean }): JSX.Element {
  return (
    <li className={`flex items-start gap-2 ${muted ? "text-gray-400" : ""}`}>
      <svg
        className={`w-4 h-4 mt-0.5 shrink-0 ${muted ? "text-gray-300" : "text-green-500"}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        {muted
          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />}
      </svg>
      <span>{children}</span>
    </li>
  );
}

interface ConnectStepProps {
  flow: "onboarding" | "reconnect";
  isSMB: boolean;
  errorMsg: string;
  onBack: () => void;
  onSuccess: (result: ConnectResult) => void;
  onError: (msg: string) => void;
}

function ConnectStep({ flow, isSMB, errorMsg, onBack, onSuccess, onError }: ConnectStepProps): JSX.Element {
  return (
    <div className="px-6 py-6 space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className={`rounded-lg px-4 py-3 text-sm ${isSMB ? "bg-purple-50 border border-purple-200 text-purple-800" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
        {isSMB ? (
          <>
            <p className="font-medium mb-1">WA Business App Number selected</p>
            <p className="text-xs opacity-80">
              Your existing WhatsApp Business App number will be migrated to the API. The WhatsApp Business mobile app will continue working during the setup.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium mb-1">New / Dedicated Number selected</p>
            <p className="text-xs opacity-80">
              A Meta popup will open to log in with Facebook and connect your WhatsApp Business Account. Make sure you have admin access to the account.
            </p>
          </>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <EmbeddedSignupButton
        flow={flow}
        isSMB={isSMB}
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  );
}
