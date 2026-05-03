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
    // @ts-expect-error -- Clerk 7 ClerkProvider is async RSC; @types/react 18 doesn't model Promise<ReactNode>
    <ClerkProvider>
      <html lang="en">
        <body>
          <QueryProvider>{children}</QueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
