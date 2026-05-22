"use client";
import { JSX, Suspense, useEffect } from "react";
import { SignIn, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

function AdminSignInInner(): JSX.Element {
  const { isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const error = params.get("error");

  useEffect(() => {
    if (!isSignedIn) return;

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/admin/super-admins/me`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          router.replace("/admin/organizations");
        } else {
          router.replace("/admin/sign-in?error=unauthorized");
        }
      } catch {
        router.replace("/admin/sign-in?error=unauthorized");
      }
    })();
  }, [isSignedIn, getToken, router]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
      <div className="mb-8 text-center">
        <p className="text-xs font-bold tracking-widest text-red-500 uppercase mb-2">Platform Administration</p>
        <h1 className="text-2xl font-bold text-white">TrustCRM Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Restricted access — authorized personnel only</p>
      </div>

      {error === "unauthorized" && (
        <div className="mb-4 w-full max-w-sm bg-red-950 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
          Access denied. This account does not have super admin privileges.
        </div>
      )}

      <div className="w-full max-w-sm">
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/admin/organizations"
          signUpUrl={undefined}
          appearance={{
            elements: {
              card: "bg-gray-900 border border-gray-700 shadow-xl",
              headerTitle: "text-white",
              headerSubtitle: "text-gray-400",
              socialButtonsBlockButton: "bg-gray-800 border-gray-600 text-white hover:bg-gray-700",
              formFieldLabel: "text-gray-300",
              formFieldInput: "bg-gray-800 border-gray-600 text-white",
              footerActionLink: "hidden",
              footerAction: "hidden",
            },
          }}
        />
      </div>

      <p className="mt-6 text-xs text-gray-600">
        Not an admin?{" "}
        <a href="/sign-in" className="text-gray-400 hover:text-gray-300 underline">
          Go to vendor sign-in
        </a>
      </p>
    </div>
  );
}

export default function AdminSignInPage(): JSX.Element {
  return (
    <Suspense>
      <AdminSignInInner />
    </Suspense>
  );
}
