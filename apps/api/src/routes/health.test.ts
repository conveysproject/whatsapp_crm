import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { healthRoute } from "./health.js";

describe("GET /health", () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(healthRoute);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 with status ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
