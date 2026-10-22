import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

const R2_BASE = "https://pub.test-r2.dev";

const mockUpload = vi.fn();
const mockDelete = vi.fn();
vi.mock("../lib/r2.js", () => ({
  uploadToR2: (...a: unknown[]) => mockUpload(...a),
  deleteFromR2: (...a: unknown[]) => mockDelete(...a),
  R2_PUBLIC_URL: "https://pub.test-r2.dev",
}));

const mockCanBeParent = vi.fn();
vi.mock("../lib/parent-orgs.js", () => ({ canBeParent: (...a: unknown[]) => mockCanBeParent(...a) }));

const mockPrisma = {
  organization: { findUnique: vi.fn(), update: vi.fn() },
  adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
};

type Auth = {
  userId: string;
  organizationId: string;
  role: string;
  permissions: Record<string, boolean>;
  teamId: null;
  teamRole: null;
};
let auth: Auth;

interface Found {
  method: string;
  url: string;
  config: Record<string, unknown> | undefined;
}

async function buildApp(found?: Found[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  if (found) {
    app.addHook("onRoute", (r) => {
      const methods = Array.isArray(r.method) ? r.method : [r.method];
      for (const method of methods) found.push({ method, url: r.url, config: r.config as Record<string, unknown> | undefined });
    });
  }
  app.addHook("onRequest", async (req) => {
    req.auth = auth as never;
  });
  await app.register((await import("@fastify/multipart")).default);
  const { brandRoutes } = await import("./brand.js");
  await app.register(brandRoutes, { prefix: "/v1" });
  return app;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(16)]);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0]), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(32)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<html><script>alert(1)</script></html>");

function multipart(file: Buffer, mimetype: string, filename: string) {
  const boundary = "----testboundary";
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, file, tail]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

const goodBody = { name: "Acme Cloud", color: "#1A2B3C", supportEmail: "help@acme.test", slug: "acme-cloud", hidePoweredBy: true };

const storedRow = {
  brandName: "Acme Cloud",
  brandColor: "#1a2b3c",
  brandSupportEmail: "help@acme.test",
  slug: "acme-cloud",
  brandHidePoweredBy: true,
  whiteLabelEnabled: false,
  logoImage: null,
  smallLogoImage: null,
  favicon: null,
  darkLogoImage: null,
  darkSmallLogoImage: null,
  darkFavicon: null,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env["R2_PUBLIC_URL"] = R2_BASE;
  auth = { userId: "u-1", organizationId: "org-A", role: "admin", permissions: {}, teamId: null, teamRole: null };
  mockCanBeParent.mockResolvedValue(true);
  mockPrisma.organization.findUnique.mockResolvedValue({ ...storedRow });
  mockPrisma.organization.update.mockResolvedValue({ ...storedRow });
  mockPrisma.adminAuditLog.create.mockResolvedValue({});
  mockUpload.mockImplementation(async (_f: Buffer, orgId: string, mime: string, prefix?: string) => {
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/x-icon" ? "ico" : mime.split("/")[1];
    const key = `${prefix ?? orgId}/uuid-1.${ext}`;
    return { key, url: `${R2_BASE}/${key}` };
  });
  mockDelete.mockResolvedValue(undefined);
});

describe("brand settings guard", () => {
  for (const role of ["manager", "agent", "viewer"]) {
    it(`${role} gets 403 on every settings route`, async () => {
      auth.role = role;
      const app = await buildApp();
      const calls = [
        app.inject({ method: "GET", url: "/v1/organizations/brand" }),
        app.inject({ method: "PUT", url: "/v1/organizations/brand", payload: goodBody }),
        app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/logo" }),
        app.inject({ method: "POST", url: "/v1/organizations/brand/assets/logo", ...multipart(PNG, "image/png", "a.png") }),
      ];
      for (const res of await Promise.all(calls)) expect(res.statusCode).toBe(403);
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      expect(mockUpload).not.toHaveBeenCalled();
      await app.close();
    });
  }

  it("a non-parent admin gets the same 403 body as a non-admin", async () => {
    const app = await buildApp();
    mockCanBeParent.mockResolvedValue(false);
    const a = await app.inject({ method: "GET", url: "/v1/organizations/brand" });
    auth.role = "manager";
    const b = await app.inject({ method: "GET", url: "/v1/organizations/brand" });
    expect(a.statusCode).toBe(403);
    expect(a.body).toBe(b.body);
    expect(mockCanBeParent).toHaveBeenCalledWith(mockPrisma, "org-A");
    await app.close();
  });
});

describe("GET /v1/organizations/brand", () => {
  it("returns the stored brand with whiteLabelEnabled and no ids", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/organizations/brand" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: {
        name: "Acme Cloud",
        color: "#1a2b3c",
        supportEmail: "help@acme.test",
        slug: "acme-cloud",
        hidePoweredBy: true,
        whiteLabelEnabled: false,
        logoUrl: null,
        smallLogoUrl: null,
        faviconUrl: null,
        darkLogoUrl: null,
        darkSmallLogoUrl: null,
        darkFaviconUrl: null,
      },
    });
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "org-A" } }));
    expect(res.body).not.toMatch(/org-A|"id"/);
    await app.close();
  });
});

describe("PUT /v1/organizations/brand", () => {
  const put = (app: FastifyInstance, payload: unknown) =>
    app.inject({ method: "PUT", url: "/v1/organizations/brand", payload: payload as object });

  it("saves the validated brand on the caller's org only and audits it", async () => {
    const app = await buildApp();
    const res = await put(app, { ...goodBody, organizationId: "org-B", logoImage: "https://evil.test/x.png", id: "org-B" });
    expect(res.statusCode).toBe(200);
    const arg = mockPrisma.organization.update.mock.calls[0]![0] as { where: unknown; data: Record<string, unknown> };
    expect(arg.where).toEqual({ id: "org-A" });
    expect(arg.data).toEqual({
      brandName: "Acme Cloud",
      brandColor: "#1a2b3c",
      brandSupportEmail: "help@acme.test",
      slug: "acme-cloud",
      brandHidePoweredBy: true,
    });
    await vi.waitFor(() => expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledTimes(1));
    const audit = mockPrisma.adminAuditLog.create.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(audit.data).toMatchObject({ action: "org.brand_update", targetId: "org-A", actorId: "u-1" });
    await app.close();
  });

  for (const [field, patch] of [
    ["slug", { slug: "Bad Slug" }],
    ["slug", { slug: "admin" }],
    ["name", { name: "<b>x</b>" }],
    ["name", { name: "a" }],
    ["color", { color: "red" }],
    ["supportEmail", { supportEmail: "not-an-email" }],
  ] as const) {
    it(`rejects invalid ${field} ${JSON.stringify(patch)} with 400 naming the field`, async () => {
      const app = await buildApp();
      const res = await put(app, { ...goodBody, ...patch });
      expect(res.statusCode).toBe(400);
      const err = res.json<{ error: { code: string; field: string; message: string } }>().error;
      expect(err.code).toBe("VALIDATION_FAILED");
      expect(err.field).toBe(field);
      expect(res.body).not.toContain("Bad Slug");
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      await app.close();
    });
  }

  it("returns 409 SLUG_TAKEN on a unique violation", async () => {
    const app = await buildApp();
    mockPrisma.organization.update.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["slug"] } }));
    const res = await put(app, goodBody);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("SLUG_TAKEN");
    await app.close();
  });

  it("D8: while white-label is enabled a PUT without supportEmail is 400 on supportEmail", async () => {
    const app = await buildApp();
    mockPrisma.organization.findUnique.mockResolvedValue({ ...storedRow, whiteLabelEnabled: true });
    const res = await put(app, { ...goodBody, supportEmail: null });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { field: string } }>().error.field).toBe("supportEmail");
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("allows editing without supportEmail while not yet approved", async () => {
    const app = await buildApp();
    const res = await put(app, { ...goodBody, supportEmail: null });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("org B's admin only ever touches org B", async () => {
    auth.organizationId = "org-B";
    const app = await buildApp();
    await put(app, { ...goodBody, organizationId: "org-A" });
    expect(mockPrisma.organization.update.mock.calls[0]![0]).toMatchObject({ where: { id: "org-B" } });
    expect(mockCanBeParent).toHaveBeenCalledWith(mockPrisma, "org-B");
    await app.close();
  });
});

describe("POST /v1/organizations/brand/assets/:slot", () => {
  const post = (app: FastifyInstance, slot: string, file: Buffer, mime: string, name = "x.png") =>
    app.inject({ method: "POST", url: `/v1/organizations/brand/assets/${slot}`, ...multipart(file, mime, name) });

  for (const [label, buf] of [
    ["SVG", SVG],
    ["GIF", GIF],
    ["HTML", HTML],
  ] as const) {
    it(`rejects ${label} even with an image/png header and .png name`, async () => {
      const app = await buildApp();
      const res = await post(app, "logo", buf, "image/png", "logo.png");
      expect(res.statusCode).toBe(415);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("UNSUPPORTED_TYPE");
      expect(mockUpload).not.toHaveBeenCalled();
      expect(mockPrisma.organization.update).not.toHaveBeenCalled();
      await app.close();
    });
  }

  it("rejects ico on a logo slot but accepts it on a favicon slot", async () => {
    const app = await buildApp();
    expect((await post(app, "logo", ICO, "image/x-icon", "a.ico")).statusCode).toBe(415);
    mockPrisma.organization.update.mockResolvedValue({ ...storedRow, favicon: `${R2_BASE}/brand/org-A/uuid-1.ico` });
    expect((await post(app, "favicon", ICO, "image/png", "a.png")).statusCode).toBe(200);
    expect(mockUpload.mock.calls[0]![2]).toBe("image/x-icon");
    await app.close();
  });

  it("rejects an oversize logo (over 1 MB) with 413 before storing", async () => {
    const app = await buildApp();
    const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
    const res = await post(app, "logo", big, "image/png");
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("FILE_TOO_LARGE");
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects an oversize favicon (over 256 KB) but accepts a 300 KB logo", async () => {
    const app = await buildApp();
    const mid = Buffer.concat([PNG, Buffer.alloc(300 * 1024)]);
    expect((await post(app, "favicon", mid, "image/png")).statusCode).toBe(413);
    expect(mockUpload).not.toHaveBeenCalled();
    expect((await post(app, "darkLogo", mid, "image/png")).statusCode).toBe(200);
    await app.close();
  });

  const slots: [string, string][] = [
    ["logo", "logoImage"],
    ["smallLogo", "smallLogoImage"],
    ["favicon", "favicon"],
    ["darkLogo", "darkLogoImage"],
    ["darkSmallLogo", "darkSmallLogoImage"],
    ["darkFavicon", "darkFavicon"],
  ];
  for (const [slot, column] of slots) {
    it(`stores slot ${slot} under brand/<org>/ and saves only an allowed URL in ${column}`, async () => {
      const app = await buildApp();
      const res = await post(app, slot, PNG, "application/octet-stream");
      expect(res.statusCode).toBe(200);
      expect(mockUpload).toHaveBeenCalledWith(expect.any(Buffer), "org-A", "image/png", "brand/org-A");
      const arg = mockPrisma.organization.update.mock.calls[0]![0] as { where: unknown; data: Record<string, string> };
      expect(arg.where).toEqual({ id: "org-A" });
      expect(arg.data).toEqual({ [column]: `${R2_BASE}/brand/org-A/uuid-1.png` });
      await app.close();
    });
  }

  it("detects jpeg and webp from magic bytes", async () => {
    const app = await buildApp();
    await post(app, "logo", JPEG, "image/png", "a.png");
    await post(app, "logo", WEBP, "image/png", "a.png");
    expect(mockUpload.mock.calls.map((c) => c[2])).toEqual(["image/jpeg", "image/webp"]);
    await app.close();
  });

  it("refuses to save, and removes the object, when the stored URL is not an allowed asset URL", async () => {
    const app = await buildApp();
    mockUpload.mockResolvedValue({ key: "brand/org-A/u.png", url: "https://evil.test/brand/org-A/u.png" });
    const res = await post(app, "logo", PNG, "image/png");
    expect(res.statusCode).toBe(500);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith("brand/org-A/u.png");
    await app.close();
  });

  it("rejects a non-multipart request and an unknown slot", async () => {
    const app = await buildApp();
    const a = await app.inject({ method: "POST", url: "/v1/organizations/brand/assets/logo", payload: { a: 1 } });
    expect(a.statusCode).toBe(400);
    const b = await post(app, "banner", PNG, "image/png");
    expect(b.statusCode).toBe(400);
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("DELETE sets the column to null for the caller's org (204)", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/darkFavicon" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-A" }, data: { darkFavicon: null } }),
    );
    await app.close();
  });
});

describe("GET /v1/brand", () => {
  const enabledParent = {
    isParent: true,
    whiteLabelEnabled: true,
    brandName: "Acme Cloud",
    brandColor: "#1a2b3c",
    brandSupportEmail: "help@acme.test",
    brandHidePoweredBy: true,
    slug: "acme-cloud",
    logoImage: `${R2_BASE}/brand/p/u.png`,
    smallLogoImage: null,
    favicon: null,
    darkLogoImage: null,
    darkSmallLogoImage: null,
    darkFavicon: null,
  };

  it("returns the parent's brand to a client with no ids, no-store", async () => {
    auth.role = "agent";
    auth.organizationId = "client-1";
    mockPrisma.organization.findUnique.mockResolvedValue({
      ...enabledParent,
      isParent: false,
      whiteLabelEnabled: false,
      brandName: null,
      parentOrganization: enabledParent,
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/brand" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const data = res.json<{ data: Record<string, unknown> }>().data;
    expect(data["name"]).toBe("Acme Cloud");
    expect(data).not.toHaveProperty("whiteLabelEnabled");
    expect(JSON.stringify(data)).not.toMatch(/client-1|"id"|organizationId/);
    await app.close();
  });

  it("returns the default for an unrelated org", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      ...enabledParent,
      isParent: false,
      whiteLabelEnabled: false,
      brandName: null,
      parentOrganization: null,
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/v1/brand" });
    expect(res.json<{ data: { name: string; isDefault: boolean } }>().data).toMatchObject({ name: "WBMSG", isDefault: true });
    await app.close();
  });
});

describe("GET /v1/public/brand/:slug", () => {
  const enabled = {
    id: "org-A",
    isParent: true,
    parentOrganizationId: null,
    whiteLabelEnabled: true,
    brandName: "Acme Cloud",
    brandColor: "#1a2b3c",
    brandSupportEmail: "help@acme.test",
    brandHidePoweredBy: false,
    slug: "acme-cloud",
    logoImage: null,
    smallLogoImage: null,
    favicon: null,
    darkLogoImage: null,
    darkSmallLogoImage: null,
    darkFavicon: null,
    parentOrganization: null,
  };
  const get = (app: FastifyInstance, slug: string) => app.inject({ method: "GET", url: `/v1/public/brand/${slug}` });

  it("returns the brand of an enabled parent, cacheable, without ids", async () => {
    const app = await buildApp();
    mockPrisma.organization.findUnique.mockResolvedValue(enabled);
    const res = await get(app, "acme-cloud");
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=60");
    expect(res.json<{ data: { name: string } }>().data.name).toBe("Acme Cloud");
    expect(res.body).not.toMatch(/org-A|"id"|organizationId|whiteLabelEnabled/);
    expect(mockPrisma.organization.findUnique.mock.calls[0]![0]).toMatchObject({ where: { slug: "acme-cloud" } });
    await app.close();
  });

  it("unknown, disabled, non-parent, child, incomplete and malformed slugs give a byte-identical 404", async () => {
    const app = await buildApp();
    const bodies = new Set<string>();
    const cases: [string, unknown][] = [
      ["unknown-slug", null],
      ["acme-cloud", { ...enabled, whiteLabelEnabled: false }],
      ["acme-cloud", { ...enabled, isParent: false }],
      ["acme-cloud", { ...enabled, parentOrganizationId: "p-1" }],
      ["acme-cloud", { ...enabled, brandName: null }],
      ["Bad_Slug!", null],
      ["a".repeat(41), null],
    ];
    for (const [slug, row] of cases) {
      mockPrisma.organization.findUnique.mockResolvedValue(row);
      const res = await get(app, slug);
      expect(res.statusCode).toBe(404);
      bodies.add(res.body);
    }
    expect(bodies.size).toBe(1);
    await app.close();
  });
});

describe("route config", () => {
  it("public and upload routes carry rate limits; public route is flagged public", async () => {
    const found: Found[] = [];
    const app = await buildApp(found);
    const pub = found.find((r) => r.method === "GET" && r.url === "/v1/public/brand/:slug")!;
    expect(pub.config).toMatchObject({ public: true, rateLimit: { max: 30, timeWindow: "1 minute" } });
    const up = found.find((r) => r.method === "POST" && r.url === "/v1/organizations/brand/assets/:slot")!;
    expect(up.config).toMatchObject({ rateLimit: { max: 20, timeWindow: "1 hour" } });
    const keyGen = (up.config as { rateLimit: { keyGenerator: (r: unknown) => string } }).rateLimit.keyGenerator;
    expect(keyGen({ auth: { organizationId: "org-A" }, ip: "1.1.1.1" })).toContain("org-A");
    const pubKey = (pub.config as { rateLimit: { keyGenerator: (r: unknown) => string } }).rateLimit.keyGenerator;
    expect(pubKey({ ip: "9.9.9.9" })).toContain("9.9.9.9");
    await app.close();
  });
});
