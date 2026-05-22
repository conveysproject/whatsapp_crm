import { createClerkClient } from "@clerk/backend";
import { timingSafeEqual } from "crypto";

const clerkAdmin = createClerkClient({
  secretKey: process.env["CLERK_SECRET_KEY"] ?? "",
});

export interface CreatedClerkUser {
  id: string;
  email: string;
}

export async function createClerkSuperAdmin(
  email: string,
  firstName: string,
  lastName: string,
  tempPassword: string
): Promise<CreatedClerkUser> {
  // If the Clerk account already exists, reuse it rather than failing
  const existing = await clerkAdmin.users.getUserList({ emailAddress: [email] });
  if (existing.data.length > 0) {
    const found = existing.data[0]!;
    return { id: found.id, email };
  }

  const user = await clerkAdmin.users.createUser({
    emailAddress: [email],
    password: tempPassword,
    firstName,
    lastName,
    skipPasswordChecks: false,
  });
  return { id: user.id, email };
}

export async function getClerkUser(userId: string) {
  return clerkAdmin.users.getUser(userId);
}

export async function deleteClerkUser(userId: string): Promise<void> {
  await clerkAdmin.users.deleteUser(userId);
}

// Constant-time comparison to prevent timing attacks on the bootstrap secret
export function verifyBootstrapSecret(provided: string): boolean {
  const expected = process.env["BOOTSTRAP_SECRET"] ?? "";
  if (!expected || expected.length < 32) return false;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function isBootstrapEnabled(): boolean {
  const secret = process.env["BOOTSTRAP_SECRET"] ?? "";
  return secret.length >= 32;
}
