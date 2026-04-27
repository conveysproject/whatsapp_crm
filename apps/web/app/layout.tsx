import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrustCRM",
  description: "WhatsApp-first CRM for SMBs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
