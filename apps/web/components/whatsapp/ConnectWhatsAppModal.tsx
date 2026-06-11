"use client";

import { useState, useRef, type JSX, type ChangeEvent } from "react";
import { EmbeddedSignupButton, type ConnectResult } from "./EmbeddedSignupButton";
export type { ConnectResult };

interface ConnectWhatsAppModalProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onClose?: () => void;
  variant?: "modal" | "inline";
}

type Step = "choose" | "verify" | "connect";

const STEP_LABELS: Record<Step, string> = {
  choose: "Step 1 of 3 — Number Type",
  verify: "Step 2 of 3 — Business Verification",
  connect: "Step 3 of 3 — Connect",
};

export function ConnectWhatsAppModal({ flow, onSuccess, onClose, variant = "modal" }: ConnectWhatsAppModalProps): JSX.Element {
  const [step, setStep] = useState<Step>("choose");
  const [isSMB, setIsSMB] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  function handleChoose(smb: boolean): void {
    setIsSMB(smb);
    setStep("verify");
  }

  const isWide = step === "choose";

  const inner = (
    <div className={variant === "modal" ? `bg-white rounded-2xl shadow-2xl w-full ${isWide ? "max-w-3xl" : "max-w-xl"}` : "w-full"}>
      {/* Step indicator */}
      {variant === "modal" && (
        <div className="px-6 pt-4 pb-0 flex items-center gap-3">
          <span className="text-xs text-gray-400">{STEP_LABELS[step]}</span>
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: step === "choose" ? "33%" : step === "verify" ? "66%" : "100%" }}
            />
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center justify-between ${variant === "modal" ? "px-6 pt-4 pb-4 border-b" : "pb-3 border-b"}`}>
        <h2 className="text-lg font-semibold text-gray-900">
          {step === "choose" ? "2 Ways to Setup WhatsApp API Number" :
           step === "verify" ? "Verify Your Business" :
           "Connect your WhatsApp"}
        </h2>
        {variant === "modal" && onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {step === "choose" ? (
        <ChooseStep onChoose={handleChoose} />
      ) : step === "verify" ? (
        <VerifyStep
          onBack={() => setStep("choose")}
          onContinue={() => setStep("connect")}
        />
      ) : (
        <ConnectStep
          flow={flow}
          isSMB={isSMB}
          errorMsg={errorMsg}
          onBack={() => { setStep("verify"); setErrorMsg(""); }}
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
    <div className="py-4 space-y-4 px-6 pt-6 pb-4 border-b">
      <p className="text-sm text-gray-500">You can connect your number in two ways. Here&apos;s how they differ.</p>
      <div className="grid grid-cols-2 gap-6">

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

function VerifyStep({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }): JSX.Element {
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [gstFile, setGstFile] = useState<File | null>(null);
  const [gstError, setGstError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedExts = ["pdf", "jpg", "jpeg", "png"];
    if (!allowedExts.includes(ext)) {
      setGstError("Only PDF, JPEG, JPG and PNG files are supported. Do not use screenshots.");
      setGstFile(null);
    } else {
      setGstError("");
      setGstFile(file);
    }
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {/* Back + title */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h3 className="font-semibold text-gray-900">Verify Your Business</h3>
        <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Recommended</span>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Verification helps increase your messaging limits and improves trust.</p>

      {/* Why verify */}
      <div className="border border-gray-200 rounded-lg px-4 py-3 space-y-1">
        <p className="text-sm font-semibold text-gray-700">Why Verification is Important:</p>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Messaging limit increases from <strong className="mx-1">250 → 1,000</strong> customers per day
        </div>
      </div>

      {/* Already verified checkbox */}
      <label className="flex items-start gap-3 border border-gray-200 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={alreadyVerified}
          onChange={(e) => setAlreadyVerified(e.target.checked)}
          className="mt-0.5 accent-green-600"
        />
        <div>
          <p className="text-sm font-medium text-gray-800">My business is already verified by Meta</p>
          <p className="text-xs text-gray-400 mt-0.5">Select this if you have already completed Meta Business Verification</p>
        </div>
      </label>

      {/* Verification methods — always visible, dimmed when already verified */}
      <div className={alreadyVerified ? "opacity-40 pointer-events-none select-none" : ""}>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Verification Method</p>
          <div className="grid grid-cols-2 gap-4">

            {/* GST Certificate */}
            <div className="border border-green-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-gray-800">Verify using GST Certificate</p>
                <span className="text-xs font-medium bg-green-600 text-white px-2 py-0.5 rounded-full">Fastest</span>
              </div>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li className="flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Takes a few minutes to a few hours
                </li>
                <li className="flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Supported: PDF, JPEG, JPG &amp; PNG (no screenshots)
                </li>
              </ul>

              {gstFile ? (
                <div className="border border-green-400 bg-green-50 rounded-lg px-3 py-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-700 min-w-0">
                      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      <span className="text-xs font-medium truncate">{gstFile.name}</span>
                    </div>
                    <button type="button" onClick={() => { setGstFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="ml-2 shrink-0 text-red-400 hover:text-red-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  <p className="text-xs text-green-600">Document ready — will be submitted after connecting</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 border border-dashed border-green-400 text-green-600 hover:bg-green-50 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Upload GST Certificate
                </button>
              )}
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
              {gstError && <p className="text-xs text-red-500">{gstError}</p>}
            </div>

            {/* Website Domain */}
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="font-semibold text-sm text-gray-800">Verify using Website Domain</p>
              <ul className="space-y-1.5 text-xs text-gray-500">
                <li className="flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Takes 3–5 working days
                </li>
                <li className="flex items-start gap-1.5">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Requires a verifiable website with additional details
                </li>
              </ul>
              <a
                href="https://www.facebook.com/business/help/2058515294227817"
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium rounded-lg transition-colors text-center"
              >
                Watch how to verify
              </a>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-gray-100">
        {alreadyVerified ? (
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-medium rounded-lg transition-colors"
          >
            Connect Number
          </button>
        ) : (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onContinue}
              className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
            >
              Connect without Verification
            </button>
            <button
              type="button"
              onClick={onContinue}
              className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Connect Number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="pb-3 border-b border-gray-100 last:border-b-0 last:pb-0">
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
