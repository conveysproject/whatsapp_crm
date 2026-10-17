// RBAC for the remaining APIs that had no permission check ("fix all gaps", 2026-10-17;
// docs/prd-whatsapp-admin-role.md). Every role uses its built-in default permissions.
import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance, type FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";

// Paid/external calls never run here: a passing gate only has to not be 403.
vi.mock("../lib/claude.js", () => ({
  AI_CONTEXT_LONG: 10,
  generateSuggestions: vi.fn().mockResolvedValue([]),
  detectIntent: vi.fn().mockResolvedValue("x"),
  analyzeSentiment: vi.fn().mockResolvedValue("x"),
  generateSmartReplies: vi.fn().mockResolvedValue([]),
  detectIntentWithConfidence: vi.fn().mockResolvedValue({}),
  buildAiContext: vi.fn().mockResolvedValue(""),
  summarizeConversation: vi.fn().mockResolvedValue(""),
}));
vi.mock("../lib/ai-rag.js", () => ({ findTopRelevantSections: vi.fn().mockResolvedValue([]), generateAnswerFromSections: vi.fn() }));
vi.mock("../lib/ai-creator.js", () => ({
  generateTemplate: vi.fn().mockResolvedValue({}), refineTemplate: vi.fn().mockResolvedValue({}),
  generateFlow: vi.fn().mockResolvedValue({}), refineFlow: vi.fn().mockResolvedValue({}),
}));
vi.mock("../lib/fal-image.js", () => ({ generateAndUploadImage: vi.fn().mockResolvedValue("https://img") }));
vi.mock("../lib/whisper.js", () => ({ transcribeAudio: vi.fn().mockResolvedValue("text") }));
vi.mock("../lib/whatsapp.js", async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(real).map((k) => [k, typeof real[k] === "function" ? vi.fn().mockResolvedValue([]) : real[k]]));
});

// Every model method resolves to "nothing found" so a passing gate ends in 200/400/404, never a crash.
type Fn = ReturnType<typeof vi.fn>;
const model = (): Record<string, Fn> =>
  new Proxy({}, { get: (t: Record<string, Fn>, k: string) => (t[k] ??= vi.fn().mockResolvedValue(k === "findMany" ? [] : null)) });
const mockPrisma = new Proxy({} as Record<string, unknown>, {
  get: (t, k: string) => (t[k] ??= k === "$transaction" ? vi.fn((ops: unknown[]) => Promise.all(ops)) : model()),
});

async function build(router: FastifyPluginAsync, role: string, prefix = "/v1"): Promise<FastifyInstance> {
  const { defaultsForRole } = await import("../lib/default-role-permissions.js");
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (req) => {
    req.auth = { userId: "u-1", organizationId: "org-1", role: role as "agent", permissions: defaultsForRole(role), teamId: null, teamRole: null };
  });
  await app.register(router, { prefix });
  return app;
}

type Case = [role: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, allowed: boolean];
const BODY = {
  name: "x", title: "x", conversationId: "c1", text: "hi", question: "q", description: "d", prompt: "p",
  refinement: "r", templateState: {}, imageUrl: "https://i", flowDefinition: {}, triggerType: "t",
  url: "https://x.test/h", events: ["message.received"],
};

async function check(router: FastifyPluginAsync, [role, method, url, allowed]: Case, prefix?: string): Promise<void> {
  const app = await build(router, role, prefix);
  const res = await app.inject({ method, url, payload: method === "GET" || method === "DELETE" ? undefined : BODY });
  if (allowed) expect(res.statusCode).not.toBe(403);
  else expect(res.statusCode).toBe(403);
  await app.close();
}

const prismaModel = (name: string): Record<string, Fn> => mockPrisma[name] as Record<string, Fn>;

beforeEach(() => { vi.clearAllMocks(); });

describe("AI: each feature follows the permission of the screen that uses it", () => {
  it.each<Case>([
    ["agent", "POST", "/v1/conversations/c1/suggestions", true],
    ["agent", "POST", "/v1/messages/m1/analyze", true],
    ["agent", "POST", "/v1/ai/smart-replies", true],
    ["agent", "POST", "/v1/ai/intent", true],
    ["agent", "POST", "/v1/ai/rag-answer", true],
    ["whatsappAdmin", "POST", "/v1/conversations/c1/suggestions", false],
    ["whatsappAdmin", "POST", "/v1/messages/m1/analyze", false],
    ["whatsappAdmin", "POST", "/v1/ai/smart-replies", false],
    ["whatsappAdmin", "POST", "/v1/ai/intent", false],
    ["whatsappAdmin", "POST", "/v1/ai/rag-answer", false],
    ["agent", "GET", "/v1/ai/predictive", false],
    ["manager", "GET", "/v1/ai/predictive", true],
    ["agent", "POST", "/v1/ai/creator/template/generate", false],
    ["agent", "POST", "/v1/ai/creator/template/refine", false],
    ["agent", "POST", "/v1/ai/creator/template/image", false],
    ["manager", "POST", "/v1/ai/creator/template/generate", true],
    ["manager", "POST", "/v1/ai/creator/flow/generate", true],
    ["viewer", "POST", "/v1/ai/creator/flow/refine", false],
    ["admin", "POST", "/v1/ai/creator/flow/generate", true],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./ai.js")).aiRouter, c));

  it("smart replies refuse a conversation the agent can't see (404, no messages read)", async () => {
    const app = await build((await import("./ai.js")).aiRouter, "agent");
    const res = await app.inject({ method: "POST", url: "/v1/ai/smart-replies", payload: { conversationId: "someone-elses" } });
    expect(res.statusCode).toBe(404);
    expect(prismaModel("message").findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("message analysis only finds messages in conversations the agent can see", async () => {
    const app = await build((await import("./ai.js")).aiRouter, "agent");
    await app.inject({ method: "POST", url: "/v1/messages/m1/analyze" });
    expect(prismaModel("message").findFirst.mock.calls[0]![0].where).toMatchObject({ id: "m1", organizationId: "org-1", conversation: { assignedTo: "u-1" } });
    await app.close();
  });
});

describe("transcriptions: inbox access + conversation visibility", () => {
  it.each<Case>([
    ["agent", "POST", "/v1/messages/m1/transcribe", true],
    ["whatsappAdmin", "POST", "/v1/messages/m1/transcribe", false],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./transcriptions.js")).transcriptionsRouter, c));

  it("only finds messages in conversations the agent can see", async () => {
    const app = await build((await import("./transcriptions.js")).transcriptionsRouter, "agent");
    await app.inject({ method: "POST", url: "/v1/messages/m1/transcribe" });
    expect(prismaModel("message").findFirst.mock.calls[0]![0].where).toMatchObject({ id: "m1", organizationId: "org-1", conversation: { assignedTo: "u-1" } });
    await app.close();
  });
});

describe("WhatsApp media upload/fetch: senders only", () => {
  it.each<Case>([
    ["agent", "POST", "/v1/media/upload", true],
    ["agent", "GET", "/v1/media/abc", true],
    ["whatsappAdmin", "POST", "/v1/media/upload", false],
    ["whatsappAdmin", "GET", "/v1/media/abc", false],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./media.js")).mediaRouter, c));
});

describe("pipelines: deals_access", () => {
  it.each<Case>([
    ["agent", "GET", "/v1/pipelines", true],
    ["agent", "POST", "/v1/pipelines", true],
    ["whatsappAdmin", "GET", "/v1/pipelines", false],
    ["whatsappAdmin", "DELETE", "/v1/pipelines/p1", false],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./pipelines.js")).pipelinesRouter, c));
});

describe("outgoing webhooks: settings_api_key", () => {
  it.each<Case>([
    ["admin", "GET", "/v1/webhook-endpoints", true],
    ["manager", "GET", "/v1/webhook-endpoints", false],
    ["manager", "POST", "/v1/webhook-endpoints", false],
    ["agent", "POST", "/v1/webhook-endpoints/w1/rotate-secret", false],
    ["whatsappAdmin", "DELETE", "/v1/webhook-endpoints/w1", false],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./webhook-endpoints.js")).webhookEndpointsRouter, c));
});

describe("onboarding: phone sync needs settings_whatsapp, status stays open", () => {
  it.each<Case>([
    ["agent", "GET", "/v1/onboarding/status", true],
    ["agent", "POST", "/v1/onboarding/sync-phone", false],
    ["manager", "POST", "/v1/onboarding/sync-phone", false],
    ["whatsappAdmin", "POST", "/v1/onboarding/sync-phone", true],
  ])("%s %s %s → allowed=%s", async (...c) => check((await import("./onboarding.js")).onboardingRouter, c, "/v1/onboarding"));
});

describe("APIs with no screen are admin-only", () => {
  it.each<Case>([
    ["manager", "GET", "/v1/info-materials", false],
    ["agent", "POST", "/v1/info-materials", false],
    ["admin", "GET", "/v1/info-materials", true],
  ])("info-materials %s %s %s → allowed=%s", async (...c) => check((await import("./info-materials.js")).infoMaterialsRouter, c));

  it.each<Case>([
    ["manager", "POST", "/v1/saved-filters", false],
    ["agent", "GET", "/v1/saved-filters", false],
    ["admin", "GET", "/v1/saved-filters", true],
  ])("saved-filters %s %s %s → allowed=%s", async (...c) => check((await import("./saved-filters.js")).savedFiltersRouter, c));

  it.each<Case>([
    ["manager", "PUT", "/v1/nt-campaign-presets/p1", false],
    ["agent", "GET", "/v1/nt-campaign-presets", false],
    ["admin", "GET", "/v1/nt-campaign-presets", true],
  ])("nt-campaign-presets %s %s %s → allowed=%s", async (...c) => check((await import("./nt-campaign-presets.js")).ntCampaignPresetsRouter, c));
});
