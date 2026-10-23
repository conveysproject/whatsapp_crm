import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { SignInScreen } from "@/components/auth/SignInScreen";
import { safeRedirect } from "@/lib/auth/redirect";
import { brandEntryMetadata } from "@/lib/brand";
import { fetchPublicBrand } from "@/lib/public-brand";

const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

type Params = { params: Promise<{ slug: string }> };
type PageProps = Params & { searchParams?: Promise<{ redirect_url?: string | string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) return NO_INDEX;
  return brandEntryMetadata(brand, "Sign in");
}

/**
 * White-label sign-in. Same form and endpoints as /sign-in. An invalid, unknown, disabled or failed brand all take the
 * one same redirect to the normal sign-in page, so a slug reveals nothing about itself.
 */
export default async function BrandedSignInPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) {
    // The fallback keeps a valid redirect_url (same safeRedirect rules as the form), so an invitation flow survives it.
    const raw = (await searchParams)?.redirect_url;
    const target = typeof raw === "string" ? safeRedirect(raw, "") : "";
    redirect(target ? `/sign-in?redirect_url=${encodeURIComponent(target)}` : "/sign-in");
  }
  return <SignInScreen brand={brand} />;
}
