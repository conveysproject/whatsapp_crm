import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

async function getOnboardingStatus(token: string): Promise<{
  wabaConnected: boolean;
  numberProvisioned: boolean;
  onboardingStep: string;
  provisioned: boolean;
}> {
  const res = await fetch(`${process.env["NEXT_PUBLIC_API_URL"] ?? ""}/v1/onboarding/status`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return { wabaConnected: false, numberProvisioned: false, onboardingStep: "connect_waba", provisioned: false };
  const data = await res.json() as { wabaConnected: boolean; numberProvisioned: boolean; onboardingStep: string };
  return { ...data, provisioned: true };
}

export default async function ChecklistPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = (await getToken()) ?? "";
  const status = await getOnboardingStatus(token);

  const steps = [
    { label: "Connect WhatsApp Business Account", done: status.wabaConnected, href: "/connect-waba" },
    { label: "Provision phone number", done: status.numberProvisioned, href: "/provision-number" },
    { label: "Invite your team", done: true, href: "/invite-team" },
  ];

  const allDone = steps.every((s) => s.done);

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Setup Checklist</h2>
      <p className="text-sm text-gray-500 mb-6">Complete these steps to start using WBMSG.</p>

      <ul className="space-y-3 mb-8">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                step.done ? "bg-green-500 text-white" : "border-2 border-gray-300 text-gray-400"
              }`}
            >
              {step.done ? "✓" : ""}
            </span>
            {step.done ? (
              <span className="text-gray-600 text-sm line-through">{step.label}</span>
            ) : (
              <Link href={step.href} className="text-green-600 hover:underline text-sm">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {allDone && (
        <Link
          href="/"
          className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors"
        >
          Go to Dashboard →
        </Link>
      )}

      {!allDone && status.provisioned && (
        <Link
          href="/"
          className="block w-full text-center text-sm text-gray-400 hover:text-gray-600 mt-4"
        >
          Skip for now, go to dashboard →
        </Link>
      )}
    </div>
  );
}
