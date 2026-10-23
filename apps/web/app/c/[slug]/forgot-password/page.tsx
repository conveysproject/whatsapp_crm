import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { AuthLogo } from "@/components/brand/AuthLogo";
import { BrandedShell } from "@/components/brand/BrandedShell";
import { brandEntryMetadata } from "@/lib/brand";
import { fetchPublicBrand } from "@/lib/public-brand";

const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) return NO_INDEX;
  return brandEntryMetadata(brand, "Forgot password");
}

/** White-label forgot-password: the existing form, inside the brand. Every non-brandable slug redirects to /forgot-password. */
export default async function BrandedForgotPasswordPage({ params }: Params): Promise<JSX.Element> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) redirect("/forgot-password");
  return (
    <BrandedShell brand={brand}>
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 mx-4 space-y-6">
          <AuthLogo />
          <ForgotPasswordForm signInHref={`/c/${brand.slug}/sign-in`} />
        </div>
      </div>
    </BrandedShell>
  );
}
