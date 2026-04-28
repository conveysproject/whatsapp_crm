import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"]! });
  return new PrismaClient({
    adapter,
    log: process.env["NODE_ENV"] === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env["NODE_ENV"] !== "production") globalForPrisma.prisma = prisma;
