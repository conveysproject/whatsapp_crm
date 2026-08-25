import type { Metadata } from "next";
import Script from "next/script";
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
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
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
          <Script id="tawk-to" strategy="afterInteractive">
            {`
              window.Tawk_API = window.Tawk_API || {};
              if (!window.__tawkLoaded) {
                window.__tawkLoaded = true;
                window.Tawk_LoadStart = new Date();
                (function () {
                  var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
                  s1.async = true;
                  s1.src = "https://embed.tawk.to/6a8d9f787f08c0344498a708/1k0sjdsk2";
                  s1.charset = "UTF-8";
                  s1.setAttribute("crossorigin", "*");
                  s0.parentNode.insertBefore(s1, s0);
                })();
              }
            `}
          </Script>
          <QueryProvider>{children}</QueryProvider>
          {/* Google Analytics 4 */}
                <Script
                  src="https://www.googletagmanager.com/gtag/js?id=G-4Q09E6BQC1"
                  strategy="afterInteractive"
                />
                <Script id="gtag-init" strategy="afterInteractive">
                  {`
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', 'G-4Q09E6BQC1', {
                      send_page_view: true,
                      allow_google_signals: true,
                      allow_ad_personalization_signals: false
                    });
                  `}
                </Script>
          
                {/* Microsoft Clarity — sign up free at clarity.microsoft.com, add NEXT_PUBLIC_CLARITY_ID to Vercel env vars */}
                {process.env.NEXT_PUBLIC_CLARITY_ID && (
                  <Script id="clarity-init" strategy="afterInteractive">
                    {`
                      (function(c,l,a,r,i,t,y){
                        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                      })(window,document,"clarity","script","${process.env.NEXT_PUBLIC_CLARITY_ID}");
                    `}
                  </Script>
                )}
        </body>
      </html>
    </ClerkProvider>
  );
}
