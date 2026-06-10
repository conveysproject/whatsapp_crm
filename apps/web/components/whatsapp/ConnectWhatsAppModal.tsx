"use client";

import { useState, type JSX } from "react";
import { EmbeddedSignupButton, type ConnectResult } from "./EmbeddedSignupButton";

interface ConnectWhatsAppModalProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onClose: () => void;
}

type Step = "choose" | "connect";

export function ConnectWhatsAppModal({ flow, onSuccess, onClose }: ConnectWhatsAppModalProps): JSX.Element {
  const [step, setStep] = useState<Step>("choose");
  const [isSMB, setIsSMB] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function handleChoose(smb: boolean): void {
    setIsSMB(smb);
    setStep("connect");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === "choose" ? "Set up WhatsApp API Number" : "Connect your WhatsApp"}
          </h2>
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
    </div>
  );
}

function ChooseStep({ onChoose }: { onChoose: (smb: boolean) => void }): JSX.Element {
  return (
    <div className="px-6 py-6 space-y-4">
      <p className="text-sm text-gray-500">Choose how you want to connect your WhatsApp number to TrustCRM.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* WA Business App Number */}
        <div className="border-2 border-purple-200 rounded-xl overflow-hidden flex flex-col">
          <div className="bg-purple-600 px-4 py-3">
            <p className="text-white font-semibold text-sm">WA Business App Number</p>
            <p className="text-purple-200 text-xs mt-0.5">Already using the WhatsApp Business app</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3 flex-1">
            <ul className="space-y-2 text-sm text-gray-600">
              <FeatureItem>Number already registered on WA Business App</FeatureItem>
              <FeatureItem>Keep using the mobile app alongside API</FeatureItem>
              <FeatureItem>Limited to 1,000 messages/day initially</FeatureItem>
              <FeatureItem muted>Cannot use WA Business App after upgrade</FeatureItem>
            </ul>
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
          <div className="bg-[#1877F2] px-4 py-3">
            <p className="text-white font-semibold text-sm">New / Dedicated Number</p>
            <p className="text-blue-200 text-xs mt-0.5">Register a fresh number via Meta</p>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3 flex-1">
            <ul className="space-y-2 text-sm text-gray-600">
              <FeatureItem>Use a new or existing SIM card number</FeatureItem>
              <FeatureItem>Full API access, no daily limits</FeatureItem>
              <FeatureItem>Verified business display name</FeatureItem>
              <FeatureItem>Best for dedicated business lines</FeatureItem>
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
