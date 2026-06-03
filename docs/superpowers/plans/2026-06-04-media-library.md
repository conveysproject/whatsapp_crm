# Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full Media Library — Cloudflare R2 file storage, CRUD API, library management page, shared picker component, and integration into the inbox, canned responses, flow nodes, and campaigns.

**Architecture:** Files uploaded by agents go to Cloudflare R2 and return a permanent public URL stored in `MediaAsset.fileUrl`. External URLs are stored directly. A shared `MediaAssetPicker` modal lets any part of the app pick an asset; when sending via WhatsApp, the R2 URL is passed as a `link` parameter (no re-upload required since `sendMediaMessage` in `whatsapp.ts` already detects `https://` and uses `link` automatically).

**Tech Stack:** `@aws-sdk/client-s3` (R2 is S3-compatible), Fastify multipart (already installed), React Query, Next.js App Router, Prisma (`MediaAsset` model already in schema).

---

## File Map

| Action | File |
|--------|------|
| Create | `apps/api/src/lib/r2.ts` |
| Create | `apps/api/src/routes/media-assets.ts` |
| Create | `apps/api/src/routes/media-assets.test.ts` |
| Create | `apps/web/app/(dashboard)/settings/media-library/MediaLibraryClient.tsx` |
| Create | `apps/web/components/media-asset-picker.tsx` |
| Modify | `apps/api/package.json` — add `@aws-sdk/client-s3` |
| Modify | `apps/api/src/routes/index.ts` — register `mediaAssetsRouter` |
| Modify | `apps/api/src/routes/messages.ts` — fix `outboundMediaUrl` for R2 URLs |
| Modify | `apps/web/app/(dashboard)/settings/media-library/page.tsx` — rewrite to use `MediaLibraryClient` |
| Modify | `apps/web/components/inbox/SendMessageForm.tsx` — add Library option to attach menu |
| Modify | `apps/web/app/(dashboard)/settings/canned-responses/CannedResponsesClient.tsx` — add Attach from Library |
| Modify | `apps/web/components/flows/FlowConfigPanel.tsx` — add library picker to media URL fields |
| Modify | `apps/api/prisma/schema.prisma` — add `mediaUrl` to `Campaign` model |
| Modify | `apps/api/src/routes/campaigns.ts` — accept `mediaUrl` |
| Modify | `apps/api/src/workers/campaign.worker.ts` — inject `mediaUrl` into template components |
| Modify | `apps/web/app/(dashboard)/campaigns/new/page.tsx` — Choose from Library in Step 2 |

---

## Task 1: Install @aws-sdk/client-s3

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Add the dependency**

Open `apps/api/package.json`. In `"dependencies"`, add:
```json
"@aws-sdk/client-s3": "^3.600.0",
```

- [ ] **Install**

```bash
pnpm install
```

Expected: lockfile updated, no errors.

- [ ] **Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add @aws-sdk/client-s3 for R2 uploads"
```

---

## Task 2: Create R2 library

**Files:**
- Create: `apps/api/src/lib/r2.ts`

- [ ] **Create the file**

```typescript
// apps/api/src/lib/r2.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const client = new S3Client({
  region: "auto",
  endpoint: process.env["R2_ENDPOINT"]!,
  credentials: {
    accessKeyId: process.env["R2_ACCESS_KEY_ID"]!,
    secretAccessKey: process.env["R2_SECRET_ACCESS_KEY"]!,
  },
});

const BUCKET = process.env["R2_BUCKET_NAME"] ?? "wbmsg-media";
const PUBLIC_URL = (process.env["R2_PUBLIC_URL"] ?? "").replace(/\/$/, "");

export async function uploadToR2(
  file: Buffer,
  organizationId: string,
  mimeType: string,
): Promise<{ key: string; url: string }> {
  const rawExt = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
  // Normalise common mime subtypes to clean extensions
  const extMap: Record<string, string> = {
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "msword": "doc",
    "vnd.ms-excel": "xls",
  };
  const ext = extMap[rawExt] ?? rawExt;
  const key = `${organizationId}/${randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file,
      ContentType: mimeType,
    }),
  );

  return { key, url: `${PUBLIC_URL}/${key}` };
}

export async function deleteFromR2(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export { PUBLIC_URL as R2_PUBLIC_URL };
```

- [ ] **Verify TypeScript compiles**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/api/src/lib/r2.ts
git commit -m "feat(api): add R2 upload/delete helpers"
```

---

## Task 3: Create media-assets route

**Files:**
- Create: `apps/api/src/routes/media-assets.ts`

- [ ] **Write the failing tests first**

Create `apps/api/src/routes/media-assets.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";

vi.mock("../lib/r2.js", () => ({
  uploadToR2: vi.fn().mockResolvedValue({ key: "org-1/uuid.jpg", url: "https://pub.r2.dev/org-1/uuid.jpg" }),
  deleteFromR2: vi.fn().mockResolvedValue(undefined),
  R2_PUBLIC_URL: "https://pub.r2.dev",
}));

const mockPrisma = {
  mediaAsset: {
    findMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};
const mockAuth = { userId: "u-1", organizationId: "org-1", role: "admin" as const, permissions: {} };

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("prisma", mockPrisma as unknown as PrismaClient);
  app.addHook("onRequest", async (r) => { r.auth = mockAuth; });
  // Register multipart support
  await app.register((await import("@fastify/multipart")).default);
  const { mediaAssetsRouter } = await import("./media-assets.js");
  await app.register(mediaAssetsRouter, { prefix: "/v1" });
  return app;
}

const sampleAsset = {
  id: "ma-1",
  organizationId: "org-1",
  title: "Product Banner",
  description: null,
  type: "image",
  fileUrl: "https://example.com/banner.jpg",
  mimeType: null,
  fileSizeBytes: null,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("GET /v1/media-assets", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("returns list of active assets", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([sampleAsset]);
    const res = await app.inject({ method: "GET", url: "/v1/media-assets" });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: unknown[] }>().data).toHaveLength(1);
  });

  it("filters by type when provided", async () => {
    mockPrisma.mediaAsset.findMany.mockResolvedValue([sampleAsset]);
    const res = await app.inject({ method: "GET", url: "/v1/media-assets?type=image" });
    expect(res.statusCode).toBe(200);
    expect(mockPrisma.mediaAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: "image" }) }),
    );
  });
});

describe("POST /v1/media-assets (URL)", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates asset from URL", async () => {
    mockPrisma.mediaAsset.create.mockResolvedValue(sampleAsset);
    const res = await app.inject({
      method: "POST",
      url: "/v1/media-assets",
      payload: { title: "Product Banner", type: "image", fileUrl: "https://example.com/banner.jpg" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("Product Banner");
  });

  it("returns 400 when required fields missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/media-assets",
      payload: { type: "image" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT /v1/media-assets/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("updates title and description", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(sampleAsset);
    mockPrisma.mediaAsset.update.mockResolvedValue({ ...sampleAsset, title: "New Title" });
    const res = await app.inject({
      method: "PUT",
      url: "/v1/media-assets/ma-1",
      payload: { title: "New Title" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { title: string } }>().data.title).toBe("New Title");
  });

  it("returns 404 when not found", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "PUT", url: "/v1/media-assets/nope", payload: { title: "X" } });
    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /v1/media-assets/:id", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("soft-deletes URL assets (isActive = false)", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(sampleAsset); // fileUrl is example.com, not R2
    mockPrisma.mediaAsset.update.mockResolvedValue({ ...sampleAsset, isActive: false });
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/ma-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it("hard-deletes R2 assets and calls deleteFromR2", async () => {
    const r2Asset = { ...sampleAsset, fileUrl: "https://pub.r2.dev/org-1/uuid.jpg" };
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(r2Asset);
    mockPrisma.mediaAsset.delete.mockResolvedValue(r2Asset);
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/ma-1" });
    expect(res.statusCode).toBe(204);
    expect(mockPrisma.mediaAsset.delete).toHaveBeenCalled();
  });

  it("returns 404 when not found", async () => {
    mockPrisma.mediaAsset.findFirst.mockResolvedValue(null);
    const res = await app.inject({ method: "DELETE", url: "/v1/media-assets/nope" });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Run tests — expect FAIL (module not found)**

```bash
pnpm --filter @WBMSG/api test -- media-assets
```

Expected: fail with `Cannot find module './media-assets.js'`

- [ ] **Create the route**

Create `apps/api/src/routes/media-assets.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { uploadToR2, deleteFromR2, R2_PUBLIC_URL } from "../lib/r2.js";

interface CreateUrlBody {
  title: string;
  type: string;
  fileUrl: string;
  description?: string;
}

interface UpdateBody {
  title?: string;
  description?: string;
}

export const mediaAssetsRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { type?: string } }>("/media-assets", async (request, reply) => {
    const { organizationId } = request.auth;
    const { type } = request.query;
    const items = await fastify.prisma.mediaAsset.findMany({
      where: { organizationId, isActive: true, ...(type ? { type } : {}) },
      orderBy: { createdAt: "desc" },
    });
    return reply.send({ data: items });
  });

  fastify.post<{ Body: CreateUrlBody }>("/media-assets", async (request, reply) => {
    const { organizationId } = request.auth;
    const { title, type, fileUrl, description } = request.body;
    if (!title || !type || !fileUrl) {
      return reply.status(400).send({ error: { code: "MISSING_FIELDS", message: "title, type, and fileUrl are required" } });
    }
    const item = await fastify.prisma.mediaAsset.create({
      data: { organizationId, title, type, fileUrl, description: description ?? null },
    });
    return reply.status(201).send({ data: item });
  });

  fastify.post("/media-assets/upload", async (request, reply) => {
    const { organizationId } = request.auth;
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk as Buffer);
    }
    const file = Buffer.concat(chunks);

    const titleField = data.fields["title"] as { value?: string } | undefined;
    const descField = data.fields["description"] as { value?: string } | undefined;
    const rawName = titleField?.value ?? data.filename ?? "Untitled";
    const title = rawName.replace(/\.[^/.]+$/, "");
    const mimeType = data.mimetype;
    const type = mimeType.startsWith("image/") ? "image"
      : mimeType.startsWith("video/") ? "video"
      : mimeType.startsWith("audio/") ? "audio"
      : "document";

    const { url } = await uploadToR2(file, organizationId, mimeType);
    const item = await fastify.prisma.mediaAsset.create({
      data: {
        organizationId,
        title,
        type,
        fileUrl: url,
        mimeType,
        fileSizeBytes: file.byteLength,
        description: descField?.value ?? null,
      },
    });
    return reply.status(201).send({ data: item });
  });

  fastify.put<{ Params: { id: string }; Body: UpdateBody }>("/media-assets/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.mediaAsset.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Media asset not found" } });
    }
    const { title, description } = request.body;
    const updated = await fastify.prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
      },
    });
    return reply.send({ data: updated });
  });

  fastify.delete<{ Params: { id: string } }>("/media-assets/:id", async (request, reply) => {
    const { organizationId } = request.auth;
    const existing = await fastify.prisma.mediaAsset.findFirst({
      where: { id: request.params.id, organizationId },
    });
    if (!existing) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Media asset not found" } });
    }
    if (R2_PUBLIC_URL && existing.fileUrl.startsWith(R2_PUBLIC_URL)) {
      const key = existing.fileUrl.slice(R2_PUBLIC_URL.length + 1);
      await deleteFromR2(key);
      await fastify.prisma.mediaAsset.delete({ where: { id: existing.id } });
    } else {
      await fastify.prisma.mediaAsset.update({ where: { id: existing.id }, data: { isActive: false } });
    }
    return reply.status(204).send();
  });
};
```

- [ ] **Run tests — expect PASS**

```bash
pnpm --filter @WBMSG/api test -- media-assets
```

Expected: all 8 tests pass.

- [ ] **Commit**

```bash
git add apps/api/src/routes/media-assets.ts apps/api/src/routes/media-assets.test.ts
git commit -m "feat(api): add /v1/media-assets CRUD + R2 upload route"
```

---

## Task 4: Register route in index.ts

**Files:**
- Modify: `apps/api/src/routes/index.ts`

- [ ] **Add import and registration**

In `apps/api/src/routes/index.ts`, after the `infoMaterialsRouter` import line:

```typescript
import { mediaAssetsRouter } from "./media-assets.js";
```

In the `routes` function, after `await fastify.register(infoMaterialsRouter, { prefix: "/v1" });`:

```typescript
await fastify.register(mediaAssetsRouter, { prefix: "/v1" });
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/api/src/routes/index.ts
git commit -m "feat(api): register mediaAssetsRouter"
```

---

## Task 5: Fix outboundMediaUrl in messages.ts

**Files:**
- Modify: `apps/api/src/routes/messages.ts`

**Context:** The messages route currently stores `outboundMediaUrl = wamid:${mediaBody.mediaId}` unconditionally. When `mediaId` is an R2 `https://` URL, the `wamid:` prefix is wrong — the inbox media proxy doesn't understand it. We store the URL directly instead.

- [ ] **Find and update the outboundMediaUrl assignment**

In `apps/api/src/routes/messages.ts`, find this block (around line 386):

```typescript
let outboundMediaUrl: string | null = null;
if (contentType !== "text" && contentType !== "interactive") {
  const mediaBody = body as { mediaId: string };
  outboundMediaUrl = `wamid:${mediaBody.mediaId}`;
}
```

Replace with:

```typescript
let outboundMediaUrl: string | null = null;
if (contentType !== "text" && contentType !== "interactive") {
  const mediaBody = body as { mediaId: string };
  outboundMediaUrl = mediaBody.mediaId.startsWith("https://")
    ? mediaBody.mediaId
    : `wamid:${mediaBody.mediaId}`;
}
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

- [ ] **Run existing messages tests**

```bash
pnpm --filter @WBMSG/api test -- messages
```

Expected: all existing tests pass.

- [ ] **Commit**

```bash
git add apps/api/src/routes/messages.ts
git commit -m "fix(api): store R2 URLs directly without wamid: prefix in outboundMediaUrl"
```

---

## Task 6: Rebuild media-library page

**Files:**
- Rewrite: `apps/web/app/(dashboard)/settings/media-library/page.tsx`
- Create: `apps/web/app/(dashboard)/settings/media-library/MediaLibraryClient.tsx`

- [ ] **Rewrite page.tsx as a thin server wrapper**

Replace the entire content of `apps/web/app/(dashboard)/settings/media-library/page.tsx` with:

```typescript
import { JSX } from "react";
import { MediaLibraryClient } from "./MediaLibraryClient";

export default function MediaLibraryPage(): JSX.Element {
  return <MediaLibraryClient />;
}
```

- [ ] **Create MediaLibraryClient.tsx**

Create `apps/web/app/(dashboard)/settings/media-library/MediaLibraryClient.tsx`:

```typescript
"use client";

import { JSX, useState, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface MediaAsset {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

const TABS = ["all", "image", "video", "document", "audio"] as const;
type Tab = (typeof TABS)[number];

const TYPE_ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  document: "📄",
  audio: "🎵",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaLibraryClient(): JSX.Element {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"upload" | "url">("upload");
  const [editAsset, setEditAsset] = useState<MediaAsset | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [urlForm, setUrlForm] = useState({ title: "", type: "image", fileUrl: "", description: "" });
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function authHeaders(): Promise<Record<string, string>> {
    const token = await getToken();
    return { Authorization: `Bearer ${token ?? ""}` };
  }

  const { data: assets = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["media-assets", activeTab],
    queryFn: async () => {
      const params = activeTab !== "all" ? `?type=${activeTab}` : "";
      const res = await fetch(`${API_URL}/v1/media-assets${params}`, {
        headers: await authHeaders(),
      });
      if (!res.ok) return [];
      return (await res.json() as { data: MediaAsset[] }).data;
    },
  });

  async function handleUploadFile(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^/.]+$/, ""));
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => (xhr.status === 201 ? resolve() : reject(new Error(xhr.responseText)));
        xhr.onerror = reject;
        void getToken().then((token) => {
          xhr.open("POST", `${API_URL}/v1/media-assets/upload`);
          xhr.setRequestHeader("Authorization", `Bearer ${token ?? ""}`);
          xhr.send(form);
        });
      });
      setAddOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleAddUrl() {
    if (!urlForm.title || !urlForm.type || !urlForm.fileUrl) return;
    setSaving(true);
    const headers = await authHeaders();
    await fetch(`${API_URL}/v1/media-assets`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: urlForm.title,
        type: urlForm.type,
        fileUrl: urlForm.fileUrl,
        description: urlForm.description || undefined,
      }),
    });
    setSaving(false);
    setAddOpen(false);
    setUrlForm({ title: "", type: "image", fileUrl: "", description: "" });
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  async function handleEdit() {
    if (!editAsset || !editForm.title) return;
    setSaving(true);
    const headers = await authHeaders();
    await fetch(`${API_URL}/v1/media-assets/${editAsset.id}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: editForm.title, description: editForm.description || null }),
    });
    setSaving(false);
    setEditAsset(null);
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this media asset? This cannot be undone.")) return;
    setDeleteId(id);
    await fetch(`${API_URL}/v1/media-assets/${id}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    setDeleteId(null);
    void queryClient.invalidateQueries({ queryKey: ["media-assets"] });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Media Library</h1>
          <p className="text-sm text-gray-500 mt-1">Reusable media assets for campaigns and flows.</p>
        </div>
        <button
          onClick={() => { setAddOpen(true); setAddTab("upload"); }}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Add Media
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={[
              "px-4 py-2 text-sm font-medium capitalize transition-colors",
              activeTab === t ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-sm text-gray-400 py-8 text-center">Loading…</p>
      ) : assets.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <p className="text-4xl mb-3">📁</p>
          <p>No media assets yet. Click &quot;+ Add Media&quot; to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assets.map((asset) => (
            <div key={asset.id} className="border rounded-xl bg-white shadow-sm overflow-hidden group">
              <div className="h-32 bg-gray-50 flex items-center justify-center overflow-hidden">
                {asset.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={asset.fileUrl} alt={asset.title} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl">{TYPE_ICONS[asset.type] ?? "📎"}</span>
                )}
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-medium text-gray-900 truncate">{asset.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 capitalize">
                    {asset.type}
                  </span>
                  {asset.fileSizeBytes !== null && (
                    <span className="text-xs text-gray-400">{formatBytes(asset.fileSizeBytes)}</span>
                  )}
                </div>
                {asset.description && (
                  <p className="text-xs text-gray-400 line-clamp-1">{asset.description}</p>
                )}
              </div>
              <div className="px-3 pb-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditAsset(asset);
                    setEditForm({ title: asset.title, description: asset.description ?? "" });
                  }}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => { void handleDelete(asset.id); }}
                  disabled={deleteId === asset.id}
                  className="text-xs px-3 py-1.5 border border-red-100 rounded-lg hover:bg-red-50 text-red-600 disabled:opacity-40"
                >
                  {deleteId === asset.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Media Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold">Add Media</h2>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex border-b border-gray-100">
              {(["upload", "url"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAddTab(tab)}
                  className={[
                    "flex-1 py-2.5 text-sm font-medium transition-colors",
                    addTab === tab ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500",
                  ].join(" ")}
                >
                  {tab === "upload" ? "Upload File" : "Paste URL"}
                </button>
              ))}
            </div>

            <div className="px-6 py-5 space-y-4">
              {addTab === "upload" ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleUploadFile(f);
                      e.target.value = "";
                    }}
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 rounded-xl h-36 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
                  >
                    {uploading ? (
                      <>
                        <div className="w-40 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-600 transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500">{uploadProgress}% uploaded…</p>
                      </>
                    ) : (
                      <>
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <p className="text-sm text-gray-600 font-medium">Click to select file</p>
                        <p className="text-xs text-gray-400">Images, videos, audio, documents</p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
                    <input
                      value={urlForm.title}
                      onChange={(e) => setUrlForm((f) => ({ ...f, title: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Product brochure"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Type <span className="text-red-500">*</span></label>
                    <select
                      value={urlForm.type}
                      onChange={(e) => setUrlForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                      <option value="audio">Audio</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">URL <span className="text-red-500">*</span></label>
                    <input
                      value={urlForm.fileUrl}
                      onChange={(e) => setUrlForm((f) => ({ ...f, fileUrl: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="https://…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={urlForm.description}
                      onChange={(e) => setUrlForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setAddOpen(false)}
                      className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
                    >Cancel</button>
                    <button
                      onClick={() => { void handleAddUrl(); }}
                      disabled={saving || !urlForm.title || !urlForm.fileUrl}
                      className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                    >
                      {saving ? "Adding…" : "Add"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-semibold">Edit Media</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title <span className="text-red-500">*</span></label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditAsset(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => { void handleEdit(); }}
                disabled={saving || !editForm.title}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/media-library/
git commit -m "feat(web): rebuild media library page with upload + URL + edit"
```

---

## Task 7: Create MediaAssetPicker component

**Files:**
- Create: `apps/web/components/media-asset-picker.tsx`

- [ ] **Create the file**

```typescript
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface MediaAsset {
  id: string;
  title: string;
  description: string | null;
  type: string;
  fileUrl: string;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

const TABS = ["all", "image", "video", "document", "audio"] as const;
type Tab = (typeof TABS)[number];

const TYPE_ICONS: Record<string, string> = {
  image: "🖼️",
  video: "🎬",
  document: "📄",
  audio: "🎵",
};

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  filterType?: "image" | "video" | "document" | "audio";
}

export function MediaAssetPicker({ open, onClose, onSelect, filterType }: Props): JSX.Element | null {
  const { getToken } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(filterType ?? "all");
  const [search, setSearch] = useState("");

  const { data: assets = [], isLoading } = useQuery<MediaAsset[]>({
    queryKey: ["media-assets", activeTab],
    queryFn: async () => {
      const token = await getToken();
      const params = activeTab !== "all" ? `?type=${activeTab}` : "";
      const res = await fetch(`${API_URL}/v1/media-assets${params}`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return [];
      return (await res.json() as { data: MediaAsset[] }).data;
    },
    enabled: open,
  });

  const filtered = assets.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()),
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Choose from Media Library</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Search + tabs */}
        <div className="px-6 pt-4 pb-0 shrink-0 space-y-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
          />
          <div className="flex gap-1 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={[
                  "px-3 py-2 text-sm font-medium capitalize transition-colors",
                  activeTab === t ? "text-brand-600 border-b-2 border-brand-600" : "text-gray-500 hover:text-gray-700",
                ].join(" ")}
              >
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Asset grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm space-y-2">
              <p className="text-3xl">📁</p>
              <p>No media assets found.</p>
              <Link
                href="/settings/media-library"
                onClick={onClose}
                className="text-brand-600 hover:underline text-xs"
              >
                Go to Media Library to add assets →
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => { onSelect(asset); onClose(); }}
                  className="border rounded-xl overflow-hidden text-left hover:border-brand-400 hover:shadow-md transition-all"
                >
                  <div className="h-24 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {asset.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.fileUrl} alt={asset.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl">{TYPE_ICONS[asset.type] ?? "📎"}</span>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-gray-800 truncate">{asset.title}</p>
                    <p className="text-xs text-gray-400 capitalize">{asset.type}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/web/components/media-asset-picker.tsx
git commit -m "feat(web): add shared MediaAssetPicker modal component"
```

---

## Task 8: Inbox integration — Library option in SendMessageForm

**Files:**
- Modify: `apps/web/components/inbox/SendMessageForm.tsx`

- [ ] **Add libraryOpen state and import**

In `apps/web/components/inbox/SendMessageForm.tsx`:

After the existing imports, add:
```typescript
import { MediaAssetPicker, type MediaAsset } from "@/components/media-asset-picker";
```

In the component state declarations (after `const [slashMenuOpen, setSlashMenuOpen] = useState(false);`), add:
```typescript
const [libraryOpen, setLibraryOpen] = useState(false);
```

- [ ] **Add handler for library asset selection**

After the `handleFileSelected` function, add:

```typescript
async function handleLibrarySelect(asset: MediaAsset) {
  if (!conversationId) return;
  setSending(true);
  try {
    const token = await getToken();
    const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        contentType: asset.type,
        mediaId: asset.fileUrl,
        filename: asset.title,
      }),
    });
    if (res.ok) {
      onSent?.();
      await queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }
  } finally {
    setSending(false);
  }
}
```

- [ ] **Add Library option to the attach menu**

In the `attachMenuOpen` dropdown block, after the existing `(["image", "video", "document", "audio"] as const).map(...)` section, add a separator and Library button:

```typescript
<div className="border-t border-gray-100 mt-1 pt-1">
  <button
    type="button"
    onClick={() => { setLibraryOpen(true); setAttachMenuOpen(false); }}
    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
  >
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
    Media Library
  </button>
</div>
```

- [ ] **Render the picker**

At the bottom of the returned JSX (before the closing `</form>`), add:

```typescript
<MediaAssetPicker
  open={libraryOpen}
  onClose={() => setLibraryOpen(false)}
  onSelect={(asset) => { void handleLibrarySelect(asset); }}
/>
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/web/components/inbox/SendMessageForm.tsx
git commit -m "feat(inbox): add Media Library picker to attach menu"
```

---

## Task 9: Canned responses — Attach from Library

**Files:**
- Modify: `apps/web/app/(dashboard)/settings/canned-responses/CannedResponsesClient.tsx`

- [ ] **Add import and state**

After existing imports, add:
```typescript
import { MediaAssetPicker, type MediaAsset } from "@/components/media-asset-picker";
```

In component state (after `const [isPending, startTransition] = useTransition();`), add:
```typescript
const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
const [attachedMedia, setAttachedMedia] = useState<MediaAsset | null>(null);
```

- [ ] **Include mediaData in payload and reset on close**

In the `handleSave` function, change the `payload` definition:
```typescript
const payload = {
  name: form.name.trim(),
  shortcut: form.shortcut.trim() || null,
  content: form.content.trim(),
  mediaData: attachedMedia
    ? { fileUrl: attachedMedia.fileUrl, type: attachedMedia.type, title: attachedMedia.title }
    : null,
};
```

In `closeForm()`, add: `setAttachedMedia(null);`

In `openEdit(item)`, add: `setAttachedMedia(null);` (canned responses don't pre-populate media on edit for simplicity)

- [ ] **Add Attach from Library button and display in form**

In the modal form, after the `content` textarea field (before the `{error && ...}` line), add:

```typescript
<div>
  <label className="block text-xs font-medium text-gray-700 mb-1">
    Media Attachment <span className="text-gray-400 font-normal">(optional)</span>
  </label>
  {attachedMedia ? (
    <div className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg bg-gray-50">
      <span className="text-sm text-gray-700 truncate flex-1">{attachedMedia.title}</span>
      <span className="text-xs text-gray-400 capitalize">{attachedMedia.type}</span>
      <button
        type="button"
        onClick={() => setAttachedMedia(null)}
        className="text-gray-400 hover:text-red-500 text-sm leading-none"
      >×</button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => setMediaPickerOpen(true)}
      className="w-full h-9 px-3 text-sm border border-dashed border-gray-300 rounded-lg hover:border-brand-400 hover:bg-brand-50/30 text-gray-500 transition-colors text-left"
    >
      + Attach from Library
    </button>
  )}
</div>
```

- [ ] **Render the picker**

At the bottom of the returned JSX (after the modal), add:

```typescript
<MediaAssetPicker
  open={mediaPickerOpen}
  onClose={() => setMediaPickerOpen(false)}
  onSelect={(asset) => { setAttachedMedia(asset); setMediaPickerOpen(false); }}
/>
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/web/app/\(dashboard\)/settings/canned-responses/CannedResponsesClient.tsx
git commit -m "feat(web): add Attach from Library to canned response form"
```

---

## Task 10: Flow nodes — Library picker for media URL fields

**Files:**
- Modify: `apps/web/components/flows/FlowConfigPanel.tsx`

- [ ] **Add import and state**

In `apps/web/components/flows/FlowConfigPanel.tsx`, after existing imports, add:
```typescript
import { MediaAssetPicker } from "@/components/media-asset-picker";
```

Inside the component (find the `FlowConfigPanel` component function), add state:
```typescript
const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
```

Add the import for `useState` if not already present — check the existing imports at the top of the file first.

- [ ] **Replace the media URL TextInput with a TextInput + Library button**

Find this block (around the `send_image`/`send_video`/`send_document`/`send_media` node type check):

```typescript
{(nodeType === "send_image" || nodeType === "send_video" || nodeType === "send_document" || nodeType === "send_media") && (
  <>
    <Field>
      <Label>{nodeType === "send_document" ? "Document URL or Media ID" : "Image/Video URL or Media ID"}</Label>
      <TextInput value={str("url") || str("mediaId")} onChange={(v) => set("url", v)} placeholder="https://... or media ID" />
    </Field>
```

Replace the `<TextInput ...>` line inside that Field with:

```typescript
      <div className="flex gap-2">
        <TextInput
          value={str("url") || str("mediaId")}
          onChange={(v) => set("url", v)}
          placeholder="https://... or media ID"
        />
        <button
          type="button"
          onClick={() => setMediaPickerOpen(true)}
          className="shrink-0 h-9 px-3 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
          title="Pick from Media Library"
        >
          Library
        </button>
      </div>
```

- [ ] **Render the picker**

Inside the component's returned JSX at the top level (after the main content div), add:

```typescript
<MediaAssetPicker
  open={mediaPickerOpen}
  onClose={() => setMediaPickerOpen(false)}
  onSelect={(asset) => {
    set("url", asset.fileUrl);
    setMediaPickerOpen(false);
  }}
  filterType={
    nodeType === "send_image" ? "image"
    : nodeType === "send_video" ? "video"
    : nodeType === "send_document" ? "document"
    : undefined
  }
/>
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit**

```bash
git add apps/web/components/flows/FlowConfigPanel.tsx
git commit -m "feat(flows): add Media Library picker to media URL fields"
```

---

## Task 11: Campaign integration — Add mediaUrl support

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/routes/campaigns.ts`
- Modify: `apps/api/src/workers/campaign.worker.ts`
- Modify: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

### 11a — Schema migration

- [ ] **Add mediaUrl field to Campaign model**

In `apps/api/prisma/schema.prisma`, find the `Campaign` model (around line 627). After the `messageInterval` field line, add:

```prisma
mediaUrl         String?             @map("media_url") @db.Text
```

- [ ] **Push schema to DB**

```bash
pnpm --filter @WBMSG/api exec prisma db push --accept-data-loss
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Create migration file and mark as applied**

```bash
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$migName = "${timestamp}_add_campaign_media_url"
$migDir = "apps/api/prisma/migrations/$migName"
New-Item -ItemType Directory -Path $migDir
Set-Content -Path "$migDir/migration.sql" -Value "ALTER TABLE `"campaigns`" ADD COLUMN IF NOT EXISTS `"media_url`" TEXT;"
pnpm --filter @WBMSG/api exec prisma migrate resolve --applied $migName
```

- [ ] **Regenerate Prisma client**

```bash
pnpm --filter @WBMSG/api generate
```

Expected: client regenerated with `mediaUrl` on `Campaign`.

- [ ] **Commit**

```bash
git add apps/api/prisma/
git commit -m "feat(api): add mediaUrl column to campaigns table"
```

### 11b — API route update

- [ ] **Accept mediaUrl in campaign create/edit**

In `apps/api/src/routes/campaigns.ts`, find the `CampaignBody` interface and add:

```typescript
mediaUrl?: string;
```

Find the `campaign.create` call in the POST handler. After `campaignType: campaignType ?? "template"`, add:

```typescript
mediaUrl: request.body.mediaUrl ?? null,
```

Find the `campaign.update` call in the PATCH handler. After the `messageInterval` update line, add:

```typescript
...(request.body.mediaUrl !== undefined ? { mediaUrl: request.body.mediaUrl } : {}),
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

### 11c — Campaign worker update

- [ ] **Inject mediaUrl into template components**

In `apps/api/src/workers/campaign.worker.ts`, find this exact line (around line 172):

```typescript
const stored = (metaTemplate.components ?? []) as unknown[];
```

Change `const` to `let`, then add the injection block immediately after it, so the result is:

```typescript
let stored = (metaTemplate.components ?? []) as unknown[];
if (campaign.mediaUrl) {
  stored = stored.map((c) => {
    const comp = c as { type?: string; format?: string; example?: Record<string, unknown> };
    if (
      comp.type?.toUpperCase() === "HEADER" &&
      comp.format &&
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(comp.format.toUpperCase())
    ) {
      return { ...comp, example: { ...(comp.example ?? {}), header_url: [campaign.mediaUrl!] } };
    }
    return c;
  });
}
```

The `const components = buildTemplateComponents(stored, { body: bodyVars });` line below stays unchanged.

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/api type-check
```

Expected: no errors.

### 11d — New campaign page UI

- [ ] **Add mediaUrl state and library picker to campaign page**

In `apps/web/app/(dashboard)/campaigns/new/page.tsx`:

After existing imports, add:
```typescript
import { MediaAssetPicker } from "@/components/media-asset-picker";
import type { MediaAsset } from "@/components/media-asset-picker";
```

In the component state declarations, add:
```typescript
const [mediaUrl, setMediaUrl] = useState("");
const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
```

In the `handleLaunch` function, inside the `createRes` JSON body, add:
```typescript
mediaUrl: campaignType === "template" && mediaUrl ? mediaUrl : undefined,
```

In **Step 2** (template campaign section), after the template preview block (`{selectedTemplate && ...}`), add:

```typescript
{selectedTemplate && (
  <div className="space-y-1.5">
    <label className="block text-sm font-medium text-gray-700">
      Media URL <span className="text-gray-400 text-xs font-normal">(optional — overrides template header image)</span>
    </label>
    <div className="flex gap-2">
      <input
        value={mediaUrl}
        onChange={(e) => setMediaUrl(e.target.value)}
        placeholder="https://… or choose from library"
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={() => setMediaPickerOpen(true)}
        className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap"
      >
        Library
      </button>
    </div>
  </div>
)}
```

At the bottom of the returned JSX, add:

```typescript
<MediaAssetPicker
  open={mediaPickerOpen}
  onClose={() => setMediaPickerOpen(false)}
  onSelect={(asset: MediaAsset) => { setMediaUrl(asset.fileUrl); setMediaPickerOpen(false); }}
/>
```

- [ ] **Type-check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Commit all campaign changes**

```bash
git add apps/api/src/routes/campaigns.ts apps/api/src/workers/campaign.worker.ts apps/web/app/\(dashboard\)/campaigns/new/page.tsx
git commit -m "feat: add mediaUrl support to campaigns — API, worker, and UI"
```

---

## Task 12: Final type-check and test run

- [ ] **Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass (known pre-existing failures: `analytics.test.ts` timeout is expected).

- [ ] **Run full type-check**

```bash
pnpm type-check
```

Expected: no errors.

- [ ] **Final commit if any loose changes**

```bash
git status
```

If any unstaged changes remain, stage and commit them with an appropriate message.
