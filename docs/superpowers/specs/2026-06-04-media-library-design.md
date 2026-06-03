# Media Library — Design Spec

**Date:** 2026-06-04
**Status:** Approved

## Overview

A centralised repository of reusable media assets (images, videos, documents, audio) for the org. Agents can upload files or paste external URLs, then pick assets when composing messages in the inbox, building campaigns, creating canned responses, or configuring flow nodes. Files are stored permanently on Cloudflare R2.

---

## 1. Data Layer

### Model: `MediaAsset` (already in schema)

```
id             String   — uuid
organizationId String   — org-scoped, RLS enforced
title          String   — human-readable name
description    String?
type           String   — image | video | document | audio
fileUrl        String   — R2 public URL (uploaded) or external URL (pasted)
mimeType       String?  — populated for uploaded files, null for URL assets
fileSizeBytes  Int?     — populated for uploaded files, null for URL assets
isActive       Boolean  — soft-delete flag
createdAt/updatedAt
```

No schema changes required.

### R2 Storage

- **Bucket:** `wbmsg-media`
- **Public URL:** `https://pub-2af9242c6b3c420583e82052bea4537f.r2.dev`
- **Endpoint:** `https://58339537c0a5843e96867b0bcac48ef4.r2.cloudflarestorage.com`
- **File key pattern:** `{organizationId}/{uuid}.{ext}` — namespaced per org, no collisions

### New lib: `apps/api/src/lib/r2.ts`

Two exported functions:

```ts
uploadToR2(file: Buffer, key: string, mimeType: string): Promise<string>
// Returns permanent public URL: R2_PUBLIC_URL + "/" + key

deleteFromR2(key: string): Promise<void>
```

Uses `@aws-sdk/client-s3` with `PutObjectCommand` and `DeleteObjectCommand`. Reads env vars `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

---

## 2. API Endpoints

New route file: `apps/api/src/routes/media-assets.ts`
Registered at prefix `/v1/media-assets`.
All routes are org-scoped via `request.auth.organizationId`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/media-assets` | List active assets. Query param `?type=image\|video\|document\|audio` |
| POST | `/v1/media-assets` | Create from pasted URL. Body: `{ title, type, fileUrl, description? }` |
| POST | `/v1/media-assets/upload` | Create from file upload. Multipart form. Uploads to R2, stores public URL |
| PUT | `/v1/media-assets/:id` | Edit `title` or `description` only |
| DELETE | `/v1/media-assets/:id` | URL assets: soft-delete (`isActive=false`). Uploaded files: hard-delete + `deleteFromR2` |

**Upload endpoint detail:**
- Accepts multipart via `request.file()` (same pattern as existing `media.ts`)
- Derives extension from `data.mimetype`
- Key: `{organizationId}/{randomUUID()}.{ext}`
- Calls `uploadToR2`, stores returned URL in `fileUrl`
- Stores `mimeType` and `fileSizeBytes` on the record

**Delete detail:**
- Detect uploaded vs URL asset: if `fileUrl` starts with `R2_PUBLIC_URL`, it's an uploaded file → call `deleteFromR2` then hard-delete the DB record
- Otherwise (external URL): soft-delete only (`isActive = false`)

---

## 3. Frontend — Library Management Page

**Files:**
- `apps/web/app/(dashboard)/settings/media-library/page.tsx` — thin server wrapper (rewrites current stub)
- `apps/web/app/(dashboard)/settings/media-library/MediaLibraryClient.tsx` — new client component

**Features:**
- Tab bar: All / Image / Video / Document / Audio — filters the grid via `?type=` query param
- 3-column asset grid. Each card shows:
  - Image thumbnail (for `type=image`, renders `<img src={fileUrl}>`)
  - Type icon (for video/document/audio)
  - Title, file size (if available), created date
  - Hover actions: Edit (title/description), Delete
- **Add Media button** → modal with two tabs:
  - **Upload tab:** drag-and-drop or file picker → `POST /v1/media-assets/upload` with progress indicator
  - **URL tab:** paste URL + select type + enter title → `POST /v1/media-assets`
- **Edit modal:** update title/description only
- **Delete:** confirm dialog. Calls `DELETE /v1/media-assets/:id`

Data fetching via React Query, invalidates `["media-assets"]` on all mutations.

---

## 4. MediaAssetPicker Component

**File:** `apps/web/components/media-asset-picker.tsx`

```ts
interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  filterType?: "image" | "video" | "document" | "audio";
}
```

- Modal overlay (same pattern as other pickers in the app)
- Tab bar + search box (filter by title)
- Scrollable asset grid — click to select, fires `onSelect(asset)` and closes
- Empty state: message + link to Settings → Media Library
- Fetches `GET /v1/media-assets` (filtered by `filterType` if provided)

---

## 5. Integration Points

### 5a. Inbox — `SendMessageForm.tsx`

- Add **"Library"** as a fifth option in the existing attach menu (below Audio)
- On click: opens `MediaAssetPicker` (no `filterType`, show all)
- On asset select: POST to `conversations/:id/messages` with:
  ```json
  { "contentType": "<asset.type>", "mediaId": "<asset.fileUrl>", "filename": "<asset.title>" }
  ```
  `sendMediaMessage` in `whatsapp.ts` already detects `https://` URLs and uses WhatsApp's `link` parameter automatically — no re-upload needed.

- **Small fix required in `messages.ts`:** The route currently stores `outboundMediaUrl = wamid:${mediaBody.mediaId}` unconditionally. When `mediaId` is an `https://` URL (i.e. an R2 asset), store `mediaUrl = mediaId` directly instead of prepending `wamid:`.

### 5b. Campaigns

- On campaign compose page, next to the media header file upload field: add **"Choose from Library"** button
- Opens `MediaAssetPicker` with `filterType` matching the template header type
- On select: sets `mediaUrl` field on the campaign draft

### 5c. Canned Responses

- In the canned response create/edit modal (`CannedResponsesClient.tsx`): add **"Attach from Library"** button
- Opens `MediaAssetPicker`
- On select: stores `{ fileUrl, type, title }` in the `mediaData` JSON field
- Shows attached asset name in the form with an ✕ to remove
- When an agent inserts the canned response in inbox, the media is sent alongside the text

### 5d. Flows

- Flow nodes that have a media URL field (e.g. `send_image`, `send_document`): add a library icon button next to the URL text input
- Opens `MediaAssetPicker` with matching `filterType`
- On select: populates the URL field with `asset.fileUrl`

---

## 6. Environment Variables

Added to Railway (production) and `apps/api/.env` (local):

```
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_ENDPOINT=https://58339537c0a5843e96867b0bcac48ef4.r2.cloudflarestorage.com
R2_BUCKET_NAME=wbmsg-media
R2_PUBLIC_URL=https://pub-2af9242c6b3c420583e82052bea4537f.r2.dev
```

---

## 7. New Dependencies

- `@aws-sdk/client-s3` — add to `apps/api/package.json`

---

## Out of Scope

- Usage tracking (which conversations/campaigns used an asset)
- Asset versioning or replacement
- Per-asset access control beyond org-level RLS
- Video transcoding or image resizing
