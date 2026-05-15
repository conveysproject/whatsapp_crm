import type { ReactNode, JSX } from "react";
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
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
    default: "Conveys Information Technology — Website Development & Design Company in Mumbai",
    template: "%s | Conveys Information Technology",
  },
  description:
    "Conveys Information Technology — professional website development, web design, mobile app development, and WhatsApp CRM solutions for businesses across India. Based in Mumbai.",
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
    "IT company Mumbai",
    "software development company India",
    "custom website development",
    "professional web design",
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
    title: "Conveys Information Technology — Website Development & Design Company",
    description:
      "Professional website development, web design, and mobile app solutions for businesses across India. Get a free quote today.",
    url: "https://conveys.in",
    siteName: "Conveys Information Technology",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Conveys Information Technology — Website Development & Design",
    description:
      "Professional website development, web design, and mobile app solutions for businesses across India.",
  },
  alternates: {
    canonical: "https://conveys.in",
  },
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <html lang="en">
      <body
        id="top"
        className={`${poppins.variable} bg-white font-sans text-slate-900`}
        style={{ fontFamily: "var(--font-conveys), system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
