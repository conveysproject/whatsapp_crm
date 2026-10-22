import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { JSX } from "react";
import { SignInScreen } from "@/components/auth/SignInScreen";
import { brandMetadata } from "@/lib/brand";
import { fetchPublicBrand } from "@/lib/public-brand";

const NO_INDEX: Metadata = { robots: { index: false, follow: false } };

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) return NO_INDEX;
  return { ...brandMetadata(brand), title: `Sign in | ${brand.name}`, ...NO_INDEX };
}

/**
 * White-label sign-in. Same form and endpoints as /sign-in. An invalid, unknown, disabled or failed brand all take the
 * one same redirect to the normal sign-in page, so a slug reveals nothing about itself.
 */
export default async function BrandedSignInPage({ params }: Params): Promise<JSX.Element> {
  const brand = await fetchPublicBrand((await params).slug);
  if (!brand) redirect("/sign-in");
  return <SignInScreen brand={brand} />;
}
