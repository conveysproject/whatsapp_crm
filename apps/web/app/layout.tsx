import type { Metadata } from "next";
import type { JSX } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { organizationSchema } from "@/lib/docs/structured-data";
import "./globals.css";

const BASE = "https://wbmsg.com";

export const metadata: Metadata = {
  title: {
    default: "WBMSG — WhatsApp CRM for Teams",
    template: "%s | WBMSG",
  },
  description:
    "WBMSG is a WhatsApp-first CRM for small and medium businesses. Shared team inbox, contacts, broadcast campaigns, automation, and AI smart replies — powered by the official Meta WhatsApp Business API.",
  metadataBase: new URL(BASE),
  alternates: { canonical: BASE },
  openGraph: {
    type: "website",
    siteName: "WBMSG",
    title: "WBMSG — WhatsApp CRM for Teams",
    description:
      "Shared team inbox, contacts, broadcast campaigns, automation, and AI smart replies — all via the official Meta WhatsApp Business API.",
    url: BASE,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "WBMSG — WhatsApp CRM" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "WBMSG — WhatsApp CRM for Teams",
    description: "Shared team inbox, campaigns, automation, and AI replies via WhatsApp Business API.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema()) }}
          />
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
