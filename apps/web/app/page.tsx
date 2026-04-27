import type { JSX } from "react";

export default function HomePage(): JSX.Element {
  return (
    <main className="p-8 font-sans">
      <h1 className="text-2xl font-bold">TrustCRM</h1>
      <p className="mt-2 text-gray-600">
        WhatsApp-first CRM for SMBs. Sprint 1 — monorepo bootstrapped.
      </p>
    </main>
  );
}
