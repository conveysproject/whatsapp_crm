import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate("prisma", prisma);
  fastify.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};

export default fp(prismaPlugin);
