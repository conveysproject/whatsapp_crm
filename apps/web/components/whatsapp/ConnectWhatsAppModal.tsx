"use client";

import { useState, type JSX } from "react";
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
            <div className="overflow-y-auto max-h-64 pr-1 space-y-0 divide-y divide-gray-100 text-sm">
              <InfoRow label="Requirements">
                <span>WA Business App <strong>v2.24.4+</strong></span>
                <span className="text-gray-400">GST Certificate or Active Website needed for verification</span>
              </InfoRow>
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
              className="mt-auto w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Proceed
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
            <div className="overflow-y-auto max-h-64 pr-1 space-y-0 divide-y divide-gray-100 text-sm">
              <InfoRow label="Requirements" variant="blue">
                <span>Fresh number — <strong>not on WA Personal or Business</strong></span>
                <span className="text-gray-400">Must receive OTP via call or SMS</span>
                <span className="text-gray-400">GST Certificate or Active Website for verification</span>
              </InfoRow>
              <InfoRow label="Number" variant="blue">
                <span>Requires a fresh phone number</span>
                <span className="text-gray-400">Cannot be already registered on WhatsApp</span>
              </InfoRow>
              <InfoRow label="App Usage" variant="blue">
                <span>Cannot use WA Business/Personal app</span>
                <span className="text-gray-400">Fully API-based — manage everything inside WBMSG</span>
              </InfoRow>
              <InfoRow label="Broadcasts" variant="blue">
                <span className="text-green-600 font-medium">Faster broadcast speeds</span>
                <span className="text-gray-400">10,000 contacts in just a few minutes</span>
              </InfoRow>
              <InfoRow label="Automations" variant="blue">
                Chatbots &amp; AI Agent available for customer replies
              </InfoRow>
              <InfoRow label="Groups / Status" variant="blue">
                <span>Groups &amp; Status sharing not available</span>
                <span className="text-gray-400">Dedicated API number only — no WA app access</span>
              </InfoRow>
              <InfoRow label="Display Name" variant="blue">
                <span className="text-green-600 font-medium">Verified business name shown</span>
                <span className="text-gray-400">Customers see your business name even without saving your number</span>
              </InfoRow>
            </div>
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

function InfoRow({ label, children, variant = "purple" }: { label: string; children: React.ReactNode; variant?: "purple" | "blue" }): JSX.Element {
  const labelColor = variant === "blue" ? "text-blue-700" : "text-purple-700";
  return (
    <div className="py-2 flex gap-3">
      <span className={`text-xs font-semibold ${labelColor} uppercase tracking-wide w-28 shrink-0 pt-0.5`}>{label}</span>
      <div className="flex flex-col gap-0.5 text-xs text-gray-700 min-w-0">{children}</div>
    </div>
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
