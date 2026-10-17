import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_PERMISSIONS, FIXED_PERMISSION_ROLES } from "./default-role-permissions.js";
import { seedLeadStatuses } from "./seed-lead-statuses.js";

export type BusinessInput = {
  companyName: string;
  companyWebsite: string;
  companyLocation: string;
  industry: string;
  subCategory: string;
  revenue: string;
};

// JSON-schema properties for the business fields, shared by /register and sign-up.
export const BUSINESS_SCHEMA = {
  companyName:     { type: "string", minLength: 1, maxLength: 255 },
  companyWebsite:  { type: "string" },
  companyLocation: { type: "string" },
  industry:        { type: "string" },
  subCategory:     { type: "string" },
  revenue:         { type: "string" },
} as const;

// First-time workspace creation: org + lead statuses + admin user + role permissions.
export async function createWorkspace(
  tx: Prisma.TransactionClient | PrismaClient,
  input: { userId: string; email: string; fullName: string; business: BusinessInput },
): Promise<{ organizationId: string }> {
  const { userId, email, fullName, business } = input;
  const { companyName, companyWebsite, companyLocation, industry, subCategory, revenue } = business;

  const org = await tx.organization.create({
    data: {
      name: companyName,
      website: companyWebsite,
      location: companyLocation,
      industry,
      subCategory,
      revenue,
      registeredAt: new Date(),
      settings: {
        website: companyWebsite,
        location: companyLocation,
        industry,
        subCategory,
        revenue,
        registeredAt: new Date().toISOString(),
      },
    },
  });
  const organizationId = org.id;
  await seedLeadStatuses(tx, organizationId);

  // GAP-S02: if vendor activation is required, start inactive until superAdmin approves
  const requireActivation = process.env["REQUIRE_VENDOR_ACTIVATION"] === "true";
  await tx.user.create({
    data: {
      id: userId,
      organizationId,
      email,
      fullName,
      role: "admin",
      isActive: !requireActivation,
    },
  });

  await tx.vendorSetting.createMany({
    // Fixed roles never read a stored row, so don't seed one.
    data: (Object.entries(DEFAULT_ROLE_PERMISSIONS) as [string, Record<string, string>][])
      .filter(([role]) => !FIXED_PERMISSION_ROLES.includes(role))
      .map(([role, perms]) => ({
        organizationId,
        key: `role_permissions_${role}`,
        value: JSON.stringify(perms),
      })),
    skipDuplicates: true,
  });

  return { organizationId };
}
