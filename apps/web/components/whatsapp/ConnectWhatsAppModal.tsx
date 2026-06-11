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
          {step === "choose" ? "2 Ways to Setup WhatsApp API Number" : "Connect your WhatsApp"}
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
    <div className="py-4 space-y-4">
      <p className="text-sm text-gray-500">You can connect your number in two ways. Here&apos;s how they differ.</p>
      <div className="grid grid-cols-2 gap-4">

        {/* WA Business App Number */}
        <div className="border border-gray-200 rounded-xl flex flex-col">
          <div className="bg-purple-50 rounded-t-xl border-b border-purple-100 px-4 py-2.5">
            <p className="text-purple-700 font-semibold text-sm">WA Business App Number</p>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: "320px" }}>
              <InfoRow label="Requirements Before Connecting">
                <BulletItem>A number registered on WhatsApp Business App <strong>version 2.24.4+</strong></BulletItem>
                <BulletItem>GST Certificate or Active Website needed for verification</BulletItem>
              </InfoRow>
              <InfoRow label="Number">
                <BulletItem>No new number needed</BulletItem>
                <BulletItem muted>Use your existing WhatsApp Business App number</BulletItem>
              </InfoRow>
              <InfoRow label="App Usage">
                <BulletItem>Continue using WhatsApp Business App alongside WBMSG</BulletItem>
                <BulletItem muted>Messages sync between WBMSG &amp; app</BulletItem>
              </InfoRow>
              <InfoRow label="Broadcasts">
                <BulletItem orange>Slower Broadcast Speeds</BulletItem>
                <BulletItem muted>Broadcast to 10,000 contacts could take an hour to send</BulletItem>
              </InfoRow>
              <InfoRow label="Chat Automations">
                <BulletItem>Possible to use Chatbots &amp; AI Agent for customer replies</BulletItem>
              </InfoRow>
              <InfoRow label="Groups, Status &amp; Calling">
                <BulletItem>Groups, Status, and Calling available on WA Business App</BulletItem>
                <BulletItem muted>WA Calling not possible from WBMSG</BulletItem>
              </InfoRow>
              <InfoRow label="Display Name">
                <BulletItem>Display name depends on contact saving</BulletItem>
                <BulletItem muted>Customers see your name only if they saved your number</BulletItem>
              </InfoRow>
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => onChoose(true)}
                className="w-full py-2 border border-purple-400 text-purple-600 hover:bg-purple-50 text-sm font-medium rounded-lg transition-colors"
              >
                Proceed with WA Business
              </button>
            </div>
          </div>
        </div>

        {/* New Number */}
        <div className="border border-gray-200 rounded-xl flex flex-col">
          <div className="bg-blue-50 rounded-t-xl border-b border-blue-100 px-4 py-2.5">
            <p className="text-blue-700 font-semibold text-sm">New Number</p>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: "320px" }}>
              <InfoRow label="Requirements Before Connecting">
                <BulletItem>Fresh number not on WA Personal/Business</BulletItem>
                <BulletItem>Must be able to receive OTP via call or SMS</BulletItem>
                <BulletItem>GST Certificate or Active Website needed for verification</BulletItem>
              </InfoRow>
              <InfoRow label="Number">
                <BulletItem>Requires a fresh phone number</BulletItem>
                <BulletItem muted>Cannot be already registered on WhatsApp</BulletItem>
              </InfoRow>
              <InfoRow label="App Usage">
                <BulletItem>Cannot use WhatsApp Business/Personal app</BulletItem>
                <BulletItem muted>Fully API-based — manage everything inside WBMSG</BulletItem>
              </InfoRow>
              <InfoRow label="Broadcasts">
                <BulletItem green>Faster Broadcast Speeds</BulletItem>
                <BulletItem muted>Broadcast to 10,000 contacts in just a few minutes</BulletItem>
              </InfoRow>
              <InfoRow label="Chat Automations">
                <BulletItem>Possible to use Chatbots &amp; AI Agent for customer replies</BulletItem>
              </InfoRow>
              <InfoRow label="Groups, Status &amp; Calling">
                <BulletItem>Groups &amp; Status sharing won&apos;t be available</BulletItem>
                <BulletItem muted>Dedicated API number only — no WA app access</BulletItem>
              </InfoRow>
              <InfoRow label="Display Name">
                <BulletItem green>Verified business name after verification</BulletItem>
                <BulletItem muted>Customers see your business name even without saving your number</BulletItem>
              </InfoRow>
            </div>
            <div className="px-4 pb-4 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => onChoose(false)}
                className="w-full py-2 border border-blue-400 text-blue-600 hover:bg-blue-50 text-sm font-medium rounded-lg transition-colors"
              >
                Proceed with New Number
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function BulletItem({ children, muted, orange, green }: { children: React.ReactNode; muted?: boolean; orange?: boolean; green?: boolean }): JSX.Element {
  const color = orange ? "text-orange-600" : green ? "text-green-600" : muted ? "text-gray-400" : "text-gray-700";
  return (
    <p className={`text-sm ${color} flex gap-1.5`}>
      <span className="mt-0.5 shrink-0">•</span>
      <span>{children}</span>
    </p>
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
