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
    "Professional website development, mobile apps, WhatsApp CRM, and AI solutions for businesses across India. In-house team, fixed pricing. Based in Mumbai.",
  keywords: [
    "website development company",
    "web design company",
    "website design and development",
    "web development company India",
    "web design company Mumbai",
    "website development Mumbai",
    "mobile app development",
    "WhatsApp CRM",
    "WhatsApp Business API",
    "AI solutions India",
    "IT company Mumbai",
    "software development company India",
    "custom website development",
    "ecommerce website development",
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
      "Professional website development, mobile apps, WhatsApp CRM, and AI solutions for businesses across India. Get a free quote today.",
    url: "https://conveys.in",
    siteName: "Conveys Information Technology",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conveys IT — Web Development, Mobile Apps & AI Solutions",
    description:
      "Professional website development, mobile apps, WhatsApp CRM, and AI solutions for businesses across India.",
  },
  alternates: {
    canonical: "https://conveys.in",
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
      areaServed: { "@type": "Country", name: "India" },
      sameAs: [],
      knowsAbout: [
        "WhatsApp Business API",
        "Web Development",
        "Mobile App Development",
        "AI Solutions",
        "LLM Integration",
        "SaaS Development",
        "Digital Marketing",
        "React",
        "Next.js",
        "Node.js",
        "React Native",
      ],
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
    <html lang="en-IN">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Replace BING_CODE below after verifying at bing.com/webmasters */}
        <meta name="msvalidate.01" content="BING_CODE_PLACEHOLDER" />
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
