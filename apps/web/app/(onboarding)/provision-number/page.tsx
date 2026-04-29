import type { JSX } from "react";
import Link from "next/link";

export default function ProvisionNumberPage(): JSX.Element {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Provision Phone Number</h2>
      <p className="text-sm text-gray-500 mb-6">
        Your WhatsApp Business Account is connected. Next, add and verify a phone number in the Meta
        Business Manager, then return here.
      </p>
      <a
        href="https://business.facebook.com/wa/manage/phone-numbers/"
        target="_blank"
        rel="noreferrer"
        className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors mb-3"
      >
        Open Meta Business Manager
      </a>
      <Link
        href="/invite-team"
        className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Number is ready — continue
      </Link>
    </div>
  );
}
