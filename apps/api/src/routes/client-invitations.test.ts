import { describe, it, expect, beforeEach, vi } from "vitest";
import type * as IdentityModule from "../auth/identity.js";
import type * as ParentOrgsModule from "../lib/parent-orgs.js";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const mockSendMail = vi.hoisted(() => vi.fn());
const mockIsEmailConfigured = vi.hoisted(() => vi.fn());
vi.mock("../lib/mail.js", () => ({
  sendMail: (...a: unknown[]) => mockSendMail(...a),
  isEmailConfigured: () => mockIsEmailConfigured(),
}));

const mockCanBeParent = vi.hoisted(() => vi.fn());
const mockLinkChild = vi.hoisted(() => vi.fn());
vi.mock("../lib/parent-orgs.js", async (orig) => ({
  ...(await orig<typeof ParentOrgsModule>()),
  canBeParent: (...a: unknown[]) => mockCanBeParent(...a),
  linkChild: (...a: unknown[]) => mockLinkChild(...a),
}));

const mockCreateWorkspace = vi.hoisted(() => vi.fn());
vi.mock("../lib/create-workspace.js", () => ({
  createWorkspace: (...a: unknown[]) => mockCreateWorkspace(...a),
}));

// Everything "created" inside a transaction goes to `pending`; it is only moved to
// `committed` when the callback resolves. A throw discards it (rollback).
const db = vi.hoisted(() => ({ pending: [] as string[], committed: [] as string[] }));

const mockPrisma: Record<string, any> = vi.hoisted(() => ({
  clientInvitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  organization: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  authAccount: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
const mockVerifyBearer = vi.hoisted(() => vi.fn());
vi.mock("../auth/identity.js", async (orig) => ({
  ...(await orig<typeof IdentityModule>()),
  verifyBearer: (...a: unknown[]) => mockVerifyBearer(...a),
}));
vi.mock("../lib/prisma.js", () => ({ prisma: mockPrisma }));

const adminAuth = {
  userId: "user-1",
  organizationId: "org-1",
  role: "admin" as const,
  permissions: {} as Record<string, string>,
  teamId: null as string | null,
  teamRole: null as "lead" | "member" | null,
};
let auth: typeof adminAuth = adminAuth;

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (request) => {
    request.auth = auth;
  });
  const { clientInvitationRoutes } = await import("./client-invitations.js");
  await app.register(clientInvitationRoutes, { prefix: "/v1" });
  return app;
}

const future = new Date(Date.now() + 86_400_000);
const past = new Date(Date.now() - 86_400_000);
const invite = {
  id: "inv-1",
  parentOrganizationId: "org-1",
  email: "client@example.com",
  token: "tok-1",
  status: "pending",
  expiresAt: future,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth = adminAuth;
  db.pending = [];
  db.committed = [];
  mockIsEmailConfigured.mockReturnValue(true);
  mockCanBeParent.mockResolvedValue(true);
  mockPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
    db.pending = [];
    const out = await fn(mockPrisma);
    db.committed.push(...db.pending);
    return out;
  });
  mockCreateWorkspace.mockImplementation(async () => {
    db.pending.push("org", "user");
    return { organizationId: "child-1" };
  });
  mockLinkChild.mockResolvedValue(undefined);
  mockPrisma.clientInvitation.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.clientInvitation.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.organization.findUnique.mockResolvedValue({ name: "Acme Agency" });
});
describe("POST /v1/client-invitations", () => {
  const post = (app: FastifyInstance, body: unknown = { email: "Client@Example.com" }) =>
    app.inject({ method: "POST", url: "/v1/client-invitations", payload: body as object });

  beforeEach(() => {
    mockPrisma.clientInvitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "inv-1",
      ...data,
    }));
  });

  it("creates a 7-day token invite for the caller's org and emails it with the read-access notice", async () => {
    const app = await buildApp();
    const res = await post(app, { email: "Client@Example.com", organizationId: "org-evil" });
    expect(res.statusCode).toBe(201);
    const data = mockPrisma.clientInvitation.create.mock.calls[0][0].data;
    expect(data.parentOrganizationId).toBe("org-1");
    expect(data.createdBy).toBe("user-1");
    expect(data.email).toBe("client@example.com");
    expect(data.token).toMatch(/^[0-9a-f-]{36}$/);
    const days = (data.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(mockCanBeParent).toHaveBeenCalledWith(mockPrisma, "org-1");
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-1" } }));
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe("client@example.com");
    expect(mail.html).toContain("full read access");
    // Not an approved white-label parent: today's options, nothing extra.
    expect(Object.keys(mail).sort()).toEqual(["html", "subject", "to"]);
    expect(mail.html).toContain(data.token);
    expect(res.json().emailSent).toBe(true);
  });

  it("brands the email with the approved parent's own brand, from-name and reply-to", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      name: "Acme Agency",
      isParent: true,
      whiteLabelEnabled: true,
      brandName: "Acme Msgs",
      brandColor: "#112233",
      brandSupportEmail: "help@acme.test",
      brandHidePoweredBy: true,
      slug: "acme",
      logoImage: null,
      smallLogoImage: null,
      favicon: null,
      darkLogoImage: null,
      darkSmallLogoImage: null,
      darkFavicon: null,
      parentOrganization: null,
    });
    const app = await buildApp();
    const res = await post(app);
    expect(res.json().emailSent).toBe(true);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.fromName).toBe("Acme Msgs");
    expect(mail.replyTo).toBe("help@acme.test");
    expect(mail.subject).toBe("You've been invited to join Acme Msgs");
    expect(mail.html).toContain("create your own Acme Msgs account");
    expect(mail.html).toContain("full read access");
    expect(mail.html).not.toContain("WBMSG");
    expect(mail.html).not.toContain(`href="https://wbmsg.com"`);
  });

  it("returns the created invite", async () => {
    const app = await buildApp();
    const res = await post(app);
    expect(res.json().data).toMatchObject({ id: "inv-1", email: "client@example.com" });
  });

  it("still returns 201 with emailSent=false when mail is not configured", async () => {
    mockIsEmailConfigured.mockReturnValue(false);
    const app = await buildApp();
    const res = await post(app);
    expect(res.statusCode).toBe(201);
    expect(res.json().emailSent).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it("role without parent_access gets 403", async () => {
    auth = { ...adminAuth, role: "agent" as never, permissions: {} };
    const app = await buildApp();
    expect((await post(app)).statusCode).toBe(403);
    expect(mockPrisma.clientInvitation.create).not.toHaveBeenCalled();
  });

  it("D15 admin only: a manager WITH parent_access granted still gets 403 on create, list and revoke", async () => {
    auth = { ...adminAuth, role: "manager" as never, permissions: { parent_access: "allow" } };
    const app = await buildApp();
    const res = await post(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("FORBIDDEN");
    expect((await app.inject({ method: "GET", url: "/v1/client-invitations" })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: "/v1/client-invitations/inv-1" })).statusCode).toBe(403);
    expect(mockPrisma.clientInvitation.create).not.toHaveBeenCalled();
    expect(mockPrisma.clientInvitation.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.clientInvitation.updateMany).not.toHaveBeenCalled();
    expect(mockCanBeParent).not.toHaveBeenCalled();
  });

  it("org that is not a parent gets 403", async () => {
    mockCanBeParent.mockResolvedValue(false);
    const app = await buildApp();
    const res = await post(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("NOT_A_PARENT");
    expect(mockPrisma.clientInvitation.create).not.toHaveBeenCalled();
  });

  it("duplicate pending invite for the same email in the same parent returns 409", async () => {
    mockPrisma.clientInvitation.findFirst.mockResolvedValue({ id: "inv-0" });
    const app = await buildApp();
    const res = await post(app);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("INVITE_EXISTS");
    const where = mockPrisma.clientInvitation.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ parentOrganizationId: "org-1", email: "client@example.com", status: "pending" });
    expect(where.expiresAt).toBeDefined();
    expect(mockPrisma.clientInvitation.create).not.toHaveBeenCalled();
  });

  it("does not query users at create (no cross-tenant email oracle): an email registered elsewhere still gets 201", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: "u-x" });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-x" });
    const app = await buildApp();
    const res = await post(app);
    expect(res.statusCode).toBe(201);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400", async () => {
    const app = await buildApp();
    expect((await post(app, { email: "nope" })).statusCode).toBe(400);
  });
});

describe("GET /v1/client-invitations", () => {
  it("lists only the caller's parent invites, without tokens", async () => {
    mockPrisma.clientInvitation.findMany.mockResolvedValue([
      { id: "i1", email: "a@b.com", status: "pending", expiresAt: future, createdAt: new Date() },
      { id: "i2", email: "c@d.com", status: "pending", expiresAt: past, createdAt: new Date() },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/client-invitations" });
    expect(res.statusCode).toBe(200);
    const q = mockPrisma.clientInvitation.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ parentOrganizationId: "org-1" });
    expect(q.select.token).toBeUndefined();
    const rows = res.json().data;
    expect(rows[0].status).toBe("pending");
    expect(rows[1].status).toBe("expired");
  });

  it("no parent_access 403, not a parent 403", async () => {
    auth = { ...adminAuth, role: "viewer" as never };
    let app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/v1/client-invitations" })).statusCode).toBe(403);
    auth = adminAuth;
    mockCanBeParent.mockResolvedValue(false);
    app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/v1/client-invitations" })).statusCode).toBe(403);
    expect(mockPrisma.clientInvitation.findMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /v1/client-invitations/:id", () => {
  it("revokes a pending invite scoped to the caller's org", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/v1/client-invitations/inv-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.clientInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", parentOrganizationId: "org-1", status: "pending" },
      data: { status: "revoked" },
    });
  });

  it("another parent's invite (or non-pending) returns 404", async () => {
    mockPrisma.clientInvitation.updateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/v1/client-invitations/inv-other" });
    expect(res.statusCode).toBe(404);
  });

  it("no parent_access 403; not a parent 403 (nothing touched in the DB)", async () => {
    auth = { ...adminAuth, role: "agent" as never };
    let app = await buildApp();
    expect((await app.inject({ method: "DELETE", url: "/v1/client-invitations/inv-1" })).statusCode).toBe(403);
    auth = adminAuth;
    mockCanBeParent.mockResolvedValue(false);
    app = await buildApp();
    expect((await app.inject({ method: "DELETE", url: "/v1/client-invitations/inv-1" })).statusCode).toBe(403);
    expect(mockPrisma.clientInvitation.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /v1/client-invitations/:token (public)", () => {
  const get = (app: FastifyInstance, token = "tok-1") =>
    app.inject({ method: "GET", url: `/v1/client-invitations/${token}` });

  it("returns only parentName, email and whether an account exists for the invited email", async () => {
    mockPrisma.clientInvitation.findUnique.mockResolvedValue({ ...invite, email: "Client@Example.com" });
    mockPrisma.authAccount.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    const res = await get(app);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: { parentName: "Acme Agency", email: "Client@Example.com", accountExists: false, brand: expect.objectContaining({ isDefault: true, name: "WBMSG" }) },
    });
    expect(mockPrisma.authAccount.findUnique).toHaveBeenCalledWith({ where: { email: "client@example.com" }, select: { id: true } });
  });

  const brandedParent = {
    name: "Acme Agency", isParent: true, whiteLabelEnabled: true, brandName: "Acme CRM", brandColor: "#0055ff",
    brandSupportEmail: "help@acme.test", brandHidePoweredBy: false, slug: "acme", logoImage: null, smallLogoImage: null,
    favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null, parentOrganization: null,
  };

  it("returns the inviting approved parent's brand payload (no ids)", async () => {
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(invite);
    mockPrisma.authAccount.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique.mockResolvedValue(brandedParent);
    const app = await buildApp();
    const data = (await get(app)).json().data;
    expect(Object.keys(data).sort()).toEqual(["accountExists", "brand", "email", "parentName"]);
    expect(data.brand).toMatchObject({ name: "Acme CRM", isDefault: false, slug: "acme", primaryColor: "#0055ff" });
    expect(data.brand.palette["500"]).toBe("#0055ff");
    expect(JSON.stringify(data)).not.toContain("org-1");
  });

  it("a failing brand lookup gives the default brand and the preview still works", async () => {
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(invite);
    mockPrisma.authAccount.findUnique.mockResolvedValue(null);
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ name: "Acme Agency" })
      .mockRejectedValueOnce(new Error("db down"));
    const app = await buildApp();
    const res = await get(app);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.parentName).toBe("Acme Agency");
    expect(res.json().data.brand.isDefault).toBe(true);
  });

  it("accountExists is true when an account for the invited email exists (nothing else about it)", async () => {
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(invite);
    mockPrisma.authAccount.findUnique.mockResolvedValue({ id: "acct-9" });
    const app = await buildApp();
    const res = await get(app);
    expect(res.json()).toEqual({
      data: { parentName: "Acme Agency", email: "client@example.com", accountExists: true, brand: expect.objectContaining({ isDefault: true }) },
    });
  });

  it("does not look up accounts for a bad token", async () => {
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(null);
    const app = await buildApp();
    expect((await get(app)).statusCode).toBe(404);
    expect(mockPrisma.authAccount.findUnique).not.toHaveBeenCalled();
  });

  it("a pending invite whose parent lost the capability gets the same 404 as any bad token and no account lookup", async () => {
    const app = await buildApp();
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(null);
    const unknown = await get(app);
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(invite);
    mockCanBeParent.mockResolvedValue(false);
    const res = await get(app);
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe(unknown.body);
    expect(mockCanBeParent).toHaveBeenCalledWith(mockPrisma, "org-1");
    expect(mockPrisma.authAccount.findUnique).not.toHaveBeenCalled();
  });

  it("unknown, used, revoked and expired tokens all give the identical 404", async () => {
    const app = await buildApp();
    const bodies: string[] = [];
    for (const row of [
      null,
      { ...invite, status: "accepted" },
      { ...invite, status: "revoked" },
      { ...invite, expiresAt: past },
    ]) {
      mockPrisma.clientInvitation.findUnique.mockResolvedValue(row);
      const res = await get(app);
      expect(res.statusCode).toBe(404);
      bodies.push(res.body);
    }
    expect(new Set(bodies).size).toBe(1);
  });
});

describe("POST /v1/client-invitations/:token/accept (public, signed in)", () => {
  const body = { fullName: "Pat Client", organizationName: "Pat Co" };
  const accept = (app: FastifyInstance, payload: object = body) =>
    app.inject({ method: "POST", url: "/v1/client-invitations/tok-1/accept", payload });

  beforeEach(() => {
    mockVerifyBearer.mockResolvedValue({ userId: "acct-1" });
    mockPrisma.clientInvitation.findUnique.mockResolvedValue(invite);
    mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "client@example.com" });
  });

  it("creates org+admin user, links, and marks accepted in ONE transaction", async () => {
    const app = await buildApp();
    const res = await accept(app, { ...body, mobileNumber: "+15550001" });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ data: { organizationId: "child-1" } });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockCreateWorkspace).toHaveBeenCalledWith(
      mockPrisma,
      expect.objectContaining({
        userId: "acct-1",
        email: "client@example.com",
        fullName: "Pat Client",
        business: expect.objectContaining({ companyName: "Pat Co" }),
      }),
    );
    expect(mockLinkChild).toHaveBeenCalledWith(mockPrisma, "org-1", "child-1", "acct-1");
    expect(mockPrisma.clientInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", status: "pending", expiresAt: { gt: expect.any(Date) } },
      data: { status: "accepted", acceptedOrgId: "child-1" },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "acct-1" }, data: { mobileNumber: "+15550001" } });
    expect(db.committed).toEqual(["org", "user"]);
  });

  it("401 when not signed in, nothing touched", async () => {
    mockVerifyBearer.mockRejectedValue(new Error("no"));
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  it("400 INVALID_TOKEN for unknown, used, revoked, expired", async () => {
    const app = await buildApp();
    for (const row of [null, { ...invite, status: "accepted" }, { ...invite, status: "revoked" }, { ...invite, expiresAt: past }]) {
      mockPrisma.clientInvitation.findUnique.mockResolvedValue(row);
      const res = await accept(app);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("INVALID_TOKEN");
    }
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
  });

  it("403 EMAIL_MISMATCH when the signed-in email differs (case-insensitive match passes)", async () => {
    mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "other@example.com" });
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("EMAIL_MISMATCH");
    expect(mockCreateWorkspace).not.toHaveBeenCalled();
    mockPrisma.authAccount.findUnique.mockResolvedValue({ email: "CLIENT@example.com" });
    expect((await accept(app)).statusCode).toBe(201);
  });

  it("409 ALREADY_MEMBER when the user already exists, nothing created", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "acct-1" });
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_MEMBER");
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(db.committed).toEqual([]);
  });

  it("losing a concurrent accept (claim count 0) rolls back the org and user", async () => {
    mockPrisma.clientInvitation.updateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TOKEN");
    expect(db.committed).toEqual([]);
  });

  it("an invite that expires between the lookup and the claim is not claimed: rolled back, generic 400", async () => {
    // The row in the database has expired by the time the claim runs (the lookup saw it as valid).
    const storedExpiresAt = new Date(Date.now() - 1);
    mockPrisma.clientInvitation.updateMany.mockImplementation(async ({ where }: { where: { expiresAt?: { gt: Date } } }) =>
      ({ count: where.expiresAt && storedExpiresAt <= where.expiresAt.gt ? 0 : 1 }),
    );
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_TOKEN");
    expect(db.committed).toEqual([]);
  });

  it("a link failure rolls back everything", async () => {
    const { ParentLinkError } = await import("../lib/parent-orgs.js");
    mockLinkChild.mockRejectedValue(new ParentLinkError("PARENT_NOT_ENABLED"));
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("PARENT_UNAVAILABLE");
    expect(db.committed).toEqual([]);
  });

  it("an org-creation failure leaves nothing and surfaces as 500", async () => {
    mockCreateWorkspace.mockRejectedValue(new Error("db down"));
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(500);
    expect(db.committed).toEqual([]);
    expect(mockLinkChild).not.toHaveBeenCalled();
  });

  it("unique violation on the user id maps to 409 ALREADY_MEMBER", async () => {
    mockCreateWorkspace.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    const app = await buildApp();
    const res = await accept(app);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("ALREADY_MEMBER");
    expect(db.committed).toEqual([]);
  });

  it("400 when required body fields are missing", async () => {
    const app = await buildApp();
    expect((await accept(app, { fullName: "x" })).statusCode).toBe(400);
  });

  it("400 for a mobile number over 30 characters, nothing created", async () => {
    const app = await buildApp();
    const res = await accept(app, { ...body, mobileNumber: "1".repeat(31) });
    expect(res.statusCode).toBe(400);
    expect(mockPrisma.clientInvitation.findUnique).not.toHaveBeenCalled();
    expect((await accept(app, { ...body, mobileNumber: "1".repeat(30) })).statusCode).toBe(201);
  });

  it("an over-long token never reaches a lookup (public GET and accept)", async () => {
    const app = await buildApp();
    const t = "x".repeat(201);
    expect((await app.inject({ method: "GET", url: `/v1/client-invitations/${t}` })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ method: "POST", url: `/v1/client-invitations/${t}/accept`, payload: body })).statusCode).toBeGreaterThanOrEqual(400);
    expect(mockPrisma.clientInvitation.findUnique).not.toHaveBeenCalled();
  });

  it("the token schema caps length at 200", async () => {
    const { tokenParamsSchema } = await import("./client-invitations.js");
    expect(tokenParamsSchema.properties.token.maxLength).toBe(200);
  });
});
