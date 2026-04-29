import type { JSX } from "react";
import Link from "next/link";

const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "";
const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";

export default function ConnectWabaPage(): JSX.Element {
  const oauthUrl =
    `https://www.facebook.com/v20.0/dialog/oauth?client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=whatsapp_business_management,whatsapp_business_messaging` +
    `&response_type=code`;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
      <p className="text-sm text-gray-500 mb-6">
        Authorise TrustCRM to manage your WhatsApp Business Account via Meta.
      </p>
      <a
        href={oauthUrl}
        className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        Connect with Meta
      </a>
      <p className="mt-4 text-center text-xs text-gray-400">
        Already connected?{" "}
        <Link href="/checklist" className="text-green-600 hover:underline">
          Skip to checklist
        </Link>
      </p>
    </div>
  );
}
