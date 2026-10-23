"use client";

import { createContext, type JSX, type ReactNode } from "react";
import { DEFAULT_BRAND, type Brand } from "@/lib/brand";

export const BrandContext = createContext<Brand>(DEFAULT_BRAND);

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }): JSX.Element {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
