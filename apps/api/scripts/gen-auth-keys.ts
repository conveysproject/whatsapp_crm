// Prints env lines for the operator to paste into Railway. Writes no files.
// Usage: npx tsx scripts/gen-auth-keys.ts
import { generateKeyPair, exportPKCS8 } from "jose";
import { randomBytes } from "node:crypto";

const { privateKey } = await generateKeyPair("EdDSA", { extractable: true });
const pem = await exportPKCS8(privateKey);
console.log(`AUTH_JWT_PRIVATE_KEY=${Buffer.from(pem).toString("base64")}`);
console.log(`AUTH_JWT_KID=k-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString("hex")}`);
