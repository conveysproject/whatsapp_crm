"use client";

import { useContext } from "react";
import { BrandContext } from "@/components/brand/BrandProvider";
import type { Brand } from "@/lib/brand";

/** The effective brand of the signed-in org. The WBMSG default when there is no provider. */
export function useBrand(): Brand {
  return useContext(BrandContext);
}
