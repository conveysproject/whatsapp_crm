"use client";

import { useEffect } from "react";
import type { Brand } from "@/lib/brand";

/**
 * Sets the tab title to the brand's name once a branded page knows its brand (the invitation pages are client
 * components and cannot export metadata). The default brand and the loading phase (null) leave the root title alone.
 */
export function useBrandTitle(brand: Brand | null): void {
  const name = brand && !brand.isDefault ? brand.name : null;
  useEffect(() => {
    if (name) document.title = name;
  }, [name]);
}
