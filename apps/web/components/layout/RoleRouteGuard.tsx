"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { WHATSAPP_ADMIN_HOME, isPathAllowedForRole } from "@/lib/role-home";

/** Sends a WhatsApp Admin back to WhatsApp Account settings from any other page. */
export function RoleRouteGuard(): null {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useCurrentUser();

  useEffect(() => {
    if (user && !isPathAllowedForRole(user.role, pathname)) router.replace(WHATSAPP_ADMIN_HOME);
  }, [user, pathname, router]);

  return null;
}
