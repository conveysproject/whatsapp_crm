"use client";

import Image from "next/image";
import type { JSX } from "react";
import { BrandLogo } from "./BrandLogo";
import { useBrand } from "@/hooks/useBrand";

/** The logo slot of the sign-in pages. The default brand keeps today's markup exactly; a brand gets its own logo or wordmark. */
export function AuthLogo(): JSX.Element {
  const brand = useBrand();
  if (brand.isDefault) {
    return <Image src="/wbmsg_logo.png" alt={brand.name} width={240} height={67} style={{ height: "48px", width: "auto" }} />;
  }
  return <BrandLogo height={48} />;
}
