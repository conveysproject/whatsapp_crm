import type { Metadata } from "next";
import type { JSX } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustCRM",
  description: "WhatsApp-first CRM for SMBs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
