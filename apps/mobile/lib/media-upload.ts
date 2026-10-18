// apps/mobile/lib/media-upload.ts
import { ApiError, type GetToken } from "./api";
import { appHeaders, noteResponseStatus } from "./app-headers";
import { recoverFrom401 } from "./auth/recovery";
import { config } from "./config";

export function contentTypeForMime(mime: string): "image" | "video" | "audio" | "document" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/** Multipart upload to the API, which forwards the file to WhatsApp and returns its media id. */
export async function uploadMedia(args: { uri: string; name: string; mimeType: string; getToken: GetToken; baseUrl?: string }): Promise<{ mediaId: string; mimeType: string; filename: string }> {
  const token = await args.getToken();
  const form = new FormData();
  // React Native's FormData accepts { uri, name, type } file parts.
  form.append("file", { uri: args.uri, name: args.name, type: args.mimeType } as unknown as Blob);
  const send = (bearer: string | null) =>
    fetch(`${args.baseUrl ?? config.apiUrl}/v1/media/upload`, {
      method: "POST",
      headers: { Accept: "application/json", ...appHeaders(), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: form,
    });
  let res = await send(token);
  // Same one-shot recovery as lib/api.ts: a revoked-but-unexpired token gets one forced refresh and one retry.
  if (res.status === 401) {
    const fresh = await recoverFrom401(token);
    if (fresh) res = await send(fresh);
  }
  noteResponseStatus(res.status);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Upload failed (${res.status})`);
  }
  const data = (json as { data: { mediaId: string; mimeType: string; filename: string } }).data;
  return { mediaId: data.mediaId, mimeType: data.mimeType, filename: data.filename };
}
