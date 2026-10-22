import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { BrandContext } from "@/components/brand/BrandProvider";
import { DEFAULT_BRAND, type Brand } from "@/lib/brand";
import { useBrandChartColors } from "./useBrandChartColors";

const HEX = /^#[0-9a-f]{6}$/;

describe("useBrandChartColors", () => {
  it("returns exactly today's hex for the default brand", () => {
    const { result } = renderHook(() => useBrandChartColors());
    expect(result.current).toEqual({ primary: "#22c55e", primaryDark: "#16a34a", primaryLight: "#4ade80", primarySoft: "#86efac" });
  });

  it("follows the brand palette", () => {
    const palette = { ...DEFAULT_BRAND.palette, 300: "#111111", 400: "#222222", 500: "#333333", 600: "#444444" };
    const brand: Brand = { ...DEFAULT_BRAND, isDefault: false, palette };
    const wrapper = ({ children }: { children: ReactNode }) => <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
    const { result } = renderHook(() => useBrandChartColors(), { wrapper });
    expect(result.current).toEqual({ primary: "#333333", primaryDark: "#444444", primaryLight: "#222222", primarySoft: "#111111" });
    for (const v of Object.values(result.current)) expect(v).toMatch(HEX);
  });
});
