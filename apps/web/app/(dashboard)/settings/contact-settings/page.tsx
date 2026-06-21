import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { ContactFieldsClient } from "./ContactFieldsClient";

export default async function ContactFieldsPage(): Promise<JSX.Element> {
  await auth.protect();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contact Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Setup the fields and configuration for your contacts.</p>
      </div>
      <Suspense fallback={null}>
        <ContactFieldsClient />
      </Suspense>
    </div>
  );
}
