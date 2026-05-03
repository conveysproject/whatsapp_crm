import type { Metadata } from "next";
import type { JSX } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "WBMSG",
  description: "WhatsApp-first Communication & Marketing Platform",
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
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
