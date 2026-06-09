import type { ReactNode, JSX } from "react";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-conveys",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://conveys.in"),
  title: {
    default: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    template: "%s | Conveys IT",
  },
  description:
    "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide. In-house team, fixed pricing.",
  keywords: [
    "web development agency",
    "website design and development",
    "custom software development",
    "SaaS product development",
    "mobile app development agency",
    "cross-platform app development",
    "WhatsApp CRM software",
    "WhatsApp Business API",
    "AI solutions for business",
    "ecommerce development agency",
  ],
  authors: [{ name: "Conveys Information Technology", url: "https://conveys.in" }],
  creator: "Conveys Information Technology",
  publisher: "Conveys Information Technology",
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
  openGraph: {
    title: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    description:
      "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide. Get a free quote today.",
    url: "https://conveys.in",
    siteName: "Conveys Information Technology",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    description:
      "Professional web development, mobile apps, WhatsApp CRM, and AI solutions for businesses worldwide.",
  },
  alternates: {
    canonical: "https://conveys.in",
  },
  verification: {
    other: {
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFY ?? "",
    },
  },
  icons: {
    icon: [
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon.ico" },
    ],
    shortcut: "/favicon/favicon.ico",
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/favicon/site.webmanifest",
  appleWebApp: {
    title: "Conveys IT",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": ["Organization", "LocalBusiness"],
      "@id": "https://conveys.in/#organization",
      name: "Conveys Information Technology",
      url: "https://conveys.in",
      logo: "https://conveys.in/conveys-logo.png",
      email: "info@conveys.in",
      telephone: "+919907072035",
      address: {
        "@type": "PostalAddress",
        streetAddress: "SwaminarayanCity",
        addressLocality: "Dombivli West",
        addressRegion: "Maharashtra",
        postalCode: "421202",
        addressCountry: "IN",
      },
      areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
      description:
        "Custom software development company. We build web applications, mobile apps, WhatsApp CRM solutions, AI-powered tools, and SaaS products for SMBs and startups globally.",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://conveys.in/#website",
      url: "https://conveys.in",
      name: "Conveys Information Technology",
      publisher: { "@id": "https://conveys.in/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: "https://conveys.in/?q={search_term_string}" },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" hrefLang="en" href="https://conveys.in" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        id="top"
        className={`${poppins.variable} bg-white font-sans text-slate-900`}
        style={{ fontFamily: "var(--font-conveys), system-ui, sans-serif" }}
      >
        {children}
      <Script
        src="https://www.googletagmanager.com/gtag/js?id=G-4Q09E6BQC1"
        strategy="afterInteractive"
      />
      <Script id="gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-4Q09E6BQC1');
        `}
      </Script>
      </body>
    </html>
  );
}
