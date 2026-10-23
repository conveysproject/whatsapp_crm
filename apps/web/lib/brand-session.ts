import { DEFAULT_BRAND, type Brand } from "@/lib/brand";
import { loadRequestBrand } from "@/lib/brand-server";
import { auth } from "@/lib/auth/server";

/** The signed-in caller's brand for layouts outside the dashboard (onboarding). Any failure gives the default brand. */
export async function loadSessionBrand(): Promise<Brand> {
  try {
    const { getToken, userId } = await auth();
    if (!userId) return DEFAULT_BRAND;
    return await loadRequestBrand((await getToken()) ?? "");
  } catch {
    return DEFAULT_BRAND;
  }
}
