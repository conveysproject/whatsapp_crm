"use client";

import { JSX, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { buildMessageEndpoint, type RevealedCredential } from "@/lib/api-credentials";

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  label,
  onCopied,
}: {
  value: string;
  label: string;
  onCopied?: () => void;
}): JSX.Element {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        void copyText(value).then((ok) => {
          setState(ok ? "copied" : "failed");
          if (ok) onCopied?.();
          setTimeout(() => setState("idle"), 2000);
        });
      }}
      className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 text-xs rounded hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Press Ctrl+C" : "Copy"}
    </button>
  );
}

/**
 * One-time secret reveal. The token lives only in the `credential` prop (parent component
 * state); the parent clears it on close. Escape/backdrop close is blocked until the user
 * has copied a value or ticked the confirmation checkbox; the explicit button always closes.
 */
export function CredentialRevealDialog({
  credential,
  title,
  onClose,
}: {
  credential: RevealedCredential;
  title: string;
  onClose: () => void;
}): JSX.Element {
  const [acknowledged, setAcknowledged] = useState(false);
  const apiHost = process.env["NEXT_PUBLIC_API_URL"];
  const endpoint = buildMessageEndpoint(apiHost, credential.authId);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white dark:bg-gray-900 p-6 shadow-xl space-y-4"
          onEscapeKeyDown={(e) => { if (!acknowledged) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (!acknowledged) e.preventDefault(); }}
          onInteractOutside={(e) => { if (!acknowledged) e.preventDefault(); }}
        >
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400">
            Credentials for <span className="font-medium">{credential.name}</span>.
          </Dialog.Description>

          <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
            This token is shown only once. Store it securely — we cannot show it again.
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="reveal-auth-id" className="block text-xs font-medium mb-1">Auth ID</label>
              <div className="flex gap-2">
                <input id="reveal-auth-id" readOnly value={credential.authId} className="flex-1 border rounded px-3 py-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-800" />
                <CopyButton value={credential.authId} label="Copy Auth ID" onCopied={() => setAcknowledged(true)} />
              </div>
            </div>
            <div>
              <label htmlFor="reveal-auth-token" className="block text-xs font-medium mb-1">Auth Token</label>
              <div className="flex gap-2">
                <input id="reveal-auth-token" readOnly value={credential.authToken} className="flex-1 border rounded px-3 py-1.5 text-xs font-mono bg-gray-50 dark:bg-gray-800" />
                <CopyButton value={credential.authToken} label="Copy Auth Token" onCopied={() => setAcknowledged(true)} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium mb-1">API base URL</p>
              <code className="block break-all rounded bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs">{endpoint}</code>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
            I have stored the token somewhere safe
          </label>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              I&apos;ve saved it
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
