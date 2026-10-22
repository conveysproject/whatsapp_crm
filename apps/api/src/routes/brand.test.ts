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
  organization: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG = Buffer.concat([PNG_SIG, Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(16)]);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(32)]);
const CUR = Buffer.concat([Buffer.from([0, 0, 2, 0, 1, 0]), Buffer.alloc(32)]);
const ICO_EMPTY = Buffer.concat([Buffer.from([0, 0, 1, 0, 0, 0]), Buffer.alloc(32)]);
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
  brandRevision: 3,
  logoImage: null,
  smallLogoImage: null,
  favicon: null,
  darkLogoImage: null,
  darkSmallLogoImage: null,
  darkFavicon: null,
};

/** The first brand write, whichever way it was made (single update when resetting, conditional updateMany otherwise). */
const written = () =>
  (mockPrisma.organization.update.mock.calls[0] ?? mockPrisma.organization.updateMany.mock.calls[0])![0] as {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  };

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env["R2_PUBLIC_URL"] = R2_BASE;
  auth = { userId: "u-1", organizationId: "org-A", role: "admin", permissions: {}, teamId: null, teamRole: null };
  mockCanBeParent.mockResolvedValue(true);
  mockPrisma.organization.findUnique.mockResolvedValue({ ...storedRow });
  mockPrisma.organization.update.mockResolvedValue({ ...storedRow });
  mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
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
        brandRevision: 3,
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
    const arg = written();
    // Not live: a conditional write bound to the flag value that was read, bumping the revision.
    expect(arg.where).toEqual({ id: "org-A", whiteLabelEnabled: false });
    expect(arg.data).toEqual({
      brandName: "Acme Cloud",
      brandColor: "#1a2b3c",
      brandSupportEmail: "help@acme.test",
      slug: "acme-cloud",
      brandHidePoweredBy: true,
      brandRevision: { increment: 1 },
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
    mockPrisma.organization.updateMany.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002", meta: { target: ["slug"] } }));
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

  it("allows editing without supportEmail while not yet approved, with a conditional write", async () => {
    const app = await buildApp();
    const res = await put(app, { ...goodBody, supportEmail: null });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "org-A", whiteLabelEnabled: false } }),
    );
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(written().data).toMatchObject({ brandRevision: { increment: 1 } });
    await app.close();
  });

  it("race: approval lands between the read and a no-email write => redone once, D8 400, nothing written", async () => {
    const app = await buildApp();
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ ...storedRow })
      .mockResolvedValueOnce({ ...storedRow, whiteLabelEnabled: true });
    const res = await put(app, { ...goodBody, supportEmail: null });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { field: string } }>().error.field).toBe("supportEmail");
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    await app.close();
  });

  it("race: an enable lands between the read and a rename => the retry sees it and resets approval", async () => {
    const app = await buildApp();
    mockPrisma.organization.updateMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.organization.findUnique
      .mockResolvedValueOnce({ ...storedRow })
      .mockResolvedValueOnce({ ...storedRow, whiteLabelEnabled: true });
    mockPrisma.organization.update.mockResolvedValue({ ...storedRow, brandName: "Renamed", whiteLabelEnabled: false, brandRevision: 4 });
    const res = await put(app, { ...goodBody, name: "Renamed" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reapprovalRequired: true, data: { whiteLabelEnabled: false, brandRevision: 4 } });
    expect(mockPrisma.organization.updateMany.mock.calls[0]![0]).toMatchObject({ where: { whiteLabelEnabled: false } });
    expect(mockPrisma.organization.update.mock.calls[0]![0]).toMatchObject({
      data: { brandName: "Renamed", whiteLabelEnabled: false, brandRevision: { increment: 1 } },
    });
    await app.close();
  });

  it("gives up with 409 CONFLICT when the flag keeps flipping", async () => {
    const app = await buildApp();
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });
    const res = await put(app, goodBody);
    expect(res.statusCode).toBe(409);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("CONFLICT");
    await app.close();
  });

  it("a non-object body gets the VALIDATION_FAILED shape with field body", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "PUT", url: "/v1/organizations/brand", headers: { "content-type": "application/json" }, payload: "null" });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string; field: string } }>().error).toMatchObject({ code: "VALIDATION_FAILED", field: "body" });
    await app.close();
  });

  describe("re-approval", () => {
    const live = { ...storedRow, whiteLabelEnabled: true };
    const lastUpdateData = () => written().data;
    const lastAudit = async (action = "org.brand_update") => {
      let found: Record<string, unknown> | undefined;
      await vi.waitFor(() => {
        const call = mockPrisma.adminAuditLog.create.mock.calls
          .map((c) => (c[0] as { data: { action: string; metadata: Record<string, unknown> } }).data)
          .find((d) => d.action === action);
        expect(call).toBeDefined();
        found = call!.metadata;
      });
      return found!;
    };

    it("renaming a live brand switches it off in the same update and says so, with before/after in the audit", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(live);
      mockPrisma.organization.update.mockResolvedValue({ ...live, brandName: "New Name", whiteLabelEnabled: false });
      const app = await buildApp();
      const res = await put(app, { ...goodBody, name: "New Name" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ reapprovalRequired: true, data: { whiteLabelEnabled: false } });
      expect(mockPrisma.organization.update).toHaveBeenCalledTimes(1);
      expect(lastUpdateData()).toMatchObject({ brandName: "New Name", whiteLabelEnabled: false });
      expect(await lastAudit()).toMatchObject({
        before: { name: "Acme Cloud", slug: "acme-cloud", supportEmail: "help@acme.test" },
        after: { name: "New Name", slug: "acme-cloud", supportEmail: "help@acme.test" },
        approvalReset: true,
      });
      await app.close();
    });

    it("changing the slug of a live brand switches it off, audit has old and new slug", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(live);
      const app = await buildApp();
      const res = await put(app, { ...goodBody, slug: "acme-two" });
      expect(res.json()).toMatchObject({ reapprovalRequired: true });
      expect(lastUpdateData()).toMatchObject({ slug: "acme-two", whiteLabelEnabled: false });
      expect(await lastAudit()).toMatchObject({ before: { slug: "acme-cloud" }, after: { slug: "acme-two" } });
      await app.close();
    });

    it("color, supportEmail and hidePoweredBy changes keep a live brand enabled", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(live);
      const app = await buildApp();
      const res = await put(app, { ...goodBody, color: "#ff0000", supportEmail: "new@acme.test", hidePoweredBy: false });
      expect(res.json()).toMatchObject({ reapprovalRequired: false });
      expect(lastUpdateData()).not.toHaveProperty("whiteLabelEnabled");
      expect((await lastAudit())["approvalReset"]).toBe(false);
      await app.close();
    });

    it("edits while not enabled never touch the flag", async () => {
      const app = await buildApp();
      const res = await put(app, { ...goodBody, name: "Another", slug: "another-one" });
      expect(res.json()).toMatchObject({ reapprovalRequired: false });
      expect(lastUpdateData()).not.toHaveProperty("whiteLabelEnabled");
      await app.close();
    });

    it("an upload on a live brand switches it off in the same update; the audit has slot and url", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(live);
      const app = await buildApp();
      const res = await app.inject({ method: "POST", url: "/v1/organizations/brand/assets/logo", ...multipart(PNG, "image/png", "a.png") });
      expect(res.json()).toMatchObject({ reapprovalRequired: true });
      expect(lastUpdateData()).toEqual({ logoImage: `${R2_BASE}/brand/org-A/uuid-1.png`, whiteLabelEnabled: false, brandRevision: { increment: 1 } });
      expect(await lastAudit("org.brand_asset")).toMatchObject({ slot: "logo", url: `${R2_BASE}/brand/org-A/uuid-1.png`, approvalReset: true });
      await app.close();
    });

    it("deleting an image on a live brand switches it off and says so; deleting an empty slot does not", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ ...live, logoImage: `${R2_BASE}/brand/org-A/old.png` });
      const app = await buildApp();
      const first = await app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/logo" });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ reapprovalRequired: true, data: { logoUrl: null } });
      expect(lastUpdateData()).toEqual({ logoImage: null, whiteLabelEnabled: false, brandRevision: { increment: 1 } });
      mockPrisma.organization.update.mockClear();
      mockPrisma.organization.updateMany.mockClear();
      mockPrisma.organization.findUnique.mockResolvedValue(live);
      const second = await app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/logo" });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ reapprovalRequired: false });
      expect(lastUpdateData()).toEqual({ logoImage: null, brandRevision: { increment: 1 } });
      await app.close();
    });

    it("a delete on a brand that is not live reports no re-approval", async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ ...storedRow, logoImage: `${R2_BASE}/brand/org-A/old.png` });
      const app = await buildApp();
      const res = await app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/logo" });
      expect(res.json()).toMatchObject({ reapprovalRequired: false });
      await app.close();
    });

    it("the public route stops serving the brand once the stored flag is off", async () => {
      const publicRow = (enabled: boolean) => ({
        id: "org-A", isParent: true, parentOrganizationId: null, whiteLabelEnabled: enabled, brandName: "Acme Cloud",
        brandColor: "#1a2b3c", brandSupportEmail: "h@a.test", brandHidePoweredBy: false, slug: "acme-cloud",
        logoImage: null, smallLogoImage: null, favicon: null, darkLogoImage: null, darkSmallLogoImage: null, darkFavicon: null,
        parentOrganization: null,
      });
      const app = await buildApp();
      mockPrisma.organization.findUnique.mockResolvedValue(publicRow(true));
      expect((await app.inject({ method: "GET", url: "/v1/public/brand/acme-cloud" })).statusCode).toBe(200);
      mockPrisma.organization.findUnique.mockResolvedValue(publicRow(false));
      expect((await app.inject({ method: "GET", url: "/v1/public/brand/acme-cloud" })).statusCode).toBe(404);
      await app.close();
    });
  });

  it("refuses PUT, upload and delete during impersonation", async () => {
    (auth as unknown as { impersonation: unknown }).impersonation = { actorId: "sa" };
    const app = await buildApp();
    const calls = [
      app.inject({ method: "PUT", url: "/v1/organizations/brand", payload: goodBody }),
      app.inject({ method: "POST", url: "/v1/organizations/brand/assets/logo", ...multipart(PNG, "image/png", "a.png") }),
      app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/logo" }),
    ];
    for (const res of await Promise.all(calls)) expect(res.statusCode).toBe(403);
    expect(mockPrisma.organization.update).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("org B's admin only ever touches org B", async () => {
    auth.organizationId = "org-B";
    const app = await buildApp();
    await put(app, { ...goodBody, organizationId: "org-A" });
    expect(written()).toMatchObject({ where: { id: "org-B" } });
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

  it("magic bytes are strict: truncated PNG, PNG without IHDR, CUR and empty ICO are rejected", async () => {
    const app = await buildApp();
    expect((await post(app, "logo", PNG_SIG.subarray(0, 5), "image/png")).statusCode).toBe(415);
    expect((await post(app, "logo", Buffer.concat([PNG_SIG, Buffer.alloc(8), Buffer.from("<html>")]), "image/png")).statusCode).toBe(415);
    expect((await post(app, "favicon", CUR, "image/x-icon", "a.ico")).statusCode).toBe(415);
    expect((await post(app, "favicon", ICO_EMPTY, "image/x-icon", "a.ico")).statusCode).toBe(415);
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("a PNG with an HTML tail passes the signature but is stored with the DETECTED content type", async () => {
    const app = await buildApp();
    const sneaky = Buffer.concat([PNG, Buffer.from("<html><script>alert(1)</script></html>")]);
    const res = await post(app, "logo", sneaky, "text/html", "x.html");
    expect(res.statusCode).toBe(200);
    expect(mockUpload.mock.calls[0]![2]).toBe("image/png");
    await app.close();
  });

  it("a stream far over the limit always ends as FILE_TOO_LARGE 413", async () => {
    const app = await buildApp();
    const huge = Buffer.concat([PNG, Buffer.alloc(3 * 1024 * 1024)]);
    const res = await post(app, "logo", huge, "image/png");
    expect(res.statusCode).toBe(413);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("FILE_TOO_LARGE");
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("503 UPLOADS_UNAVAILABLE without leaking the variable name when R2_PUBLIC_URL is unset or not https", async () => {
    const app = await buildApp();
    for (const v of [undefined, "http://pub.test-r2.dev"]) {
      if (v === undefined) delete process.env["R2_PUBLIC_URL"];
      else process.env["R2_PUBLIC_URL"] = v;
      const res = await post(app, "logo", PNG, "image/png");
      expect(res.statusCode).toBe(503);
      expect(res.json<{ error: { code: string } }>().error.code).toBe("UPLOADS_UNAVAILABLE");
      expect(res.body).not.toContain("R2_PUBLIC_URL");
    }
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("deletes the new object and rethrows when the database update fails after the upload", async () => {
    const app = await buildApp();
    mockPrisma.organization.updateMany.mockRejectedValue(new Error("db down"));
    const res = await post(app, "logo", PNG, "image/png");
    expect(res.statusCode).toBe(500);
    expect(mockDelete).toHaveBeenCalledWith("brand/org-A/uuid-1.png");
    await app.close();
  });

  it("a multipart request with no file part is 400 NO_FILE", async () => {
    const app = await buildApp();
    const boundary = "----b";
    const payload = `--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\nhi\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations/brand/assets/logo",
      payload,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NO_FILE");
    expect(mockUpload).not.toHaveBeenCalled();
    await app.close();
  });

  it("two file parts never store more than one object", async () => {
    const app = await buildApp();
    const boundary = "----b2";
    const part = (n: string) =>
      Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${n}"; filename="${n}.png"\r\nContent-Type: image/png\r\n\r\n`),
        PNG,
        Buffer.from("\r\n"),
      ]);
    const payload = Buffer.concat([part("a"), part("b"), Buffer.from(`--${boundary}--\r\n`)]);
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations/brand/assets/logo",
      payload,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBeLessThan(500);
    expect(mockUpload.mock.calls.length).toBeLessThanOrEqual(1);
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
      const arg = written();
      expect(arg.where).toEqual({ id: "org-A", whiteLabelEnabled: false });
      expect(arg.data).toEqual({ [column]: `${R2_BASE}/brand/org-A/uuid-1.png`, brandRevision: { increment: 1 } });
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

  it("DELETE sets the column to null for the caller's org, bumps the revision and returns the stored brand", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "DELETE", url: "/v1/organizations/brand/assets/darkFavicon" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reapprovalRequired: false, data: { darkFaviconUrl: null, brandRevision: 3 } });
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: "org-A", whiteLabelEnabled: false },
      data: { darkFavicon: null, brandRevision: { increment: 1 } },
    });
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
    expect(keyGen({ auth: { organizationId: "org-A" }, ip: "1.1.1.1", headers: {} })).toBe("brand-upload:org-A");
    const pubKey = (pub.config as { rateLimit: { keyGenerator: (r: unknown) => string } }).rateLimit.keyGenerator;
    // Behind the proxy req.ip is the same private hop for everyone: the forwarded address picks the bucket.
    const viaProxy = (xff: string) => pubKey({ ip: "100.64.0.5", headers: { "x-forwarded-for": xff } });
    expect(viaProxy("203.0.113.7")).not.toBe(viaProxy("198.51.100.9"));
    expect(viaProxy("203.0.113.7")).toBe(viaProxy("203.0.113.7"));
    expect(viaProxy("203.0.113.7")).toContain("203.0.113.7");
    await app.close();
  });
});
