import type { JSX, ReactNode } from "react";
import { brandCssText, type Brand } from "@/lib/brand";
import { BrandProvider } from "./BrandProvider";

/**
 * Wraps an entry page (sign-in, invitation accept) in a brand: the brand's color variables as a <style> (nothing at
 * all for the default brand, whose defaults are already in globals.css) and the brand context for BrandLogo/useBrand.
 * The default brand renders the children and nothing else, so the page markup is today's.
 */
export function BrandedShell({ brand, children }: { brand: Brand; children: ReactNode }): JSX.Element {
  const css = brandCssText(brand);
  return (
    <BrandProvider brand={brand}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {children}
    </BrandProvider>
  );
}
