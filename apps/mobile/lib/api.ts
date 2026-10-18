import { appHeaders, noteResponseStatus } from "./app-headers";
import { recoverFrom401 } from "./auth/recovery";
import { config } from "./config";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type GetToken = () => Promise<string | null>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Api = <T>(path: string, init?: { method?: Method; body?: unknown }) => Promise<T>;

/**
 * Fetch wrapper for the WBMSG API. A fresh token is requested for every call; a 426 shows the "Update the app" screen.
 * A 401 on a token the app still thought valid gets one forced refresh and one retry (WBMSG login only); never more.
 */
export function createApi(getToken: GetToken, baseUrl: string = config.apiUrl): Api {
  return async function api<T>(path: string, init: { method?: Method; body?: unknown } = {}): Promise<T> {
    const hasBody = init.body !== undefined;
    const send = (token: string | null) => {
      const headers: Record<string, string> = { Accept: "application/json", ...appHeaders() };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (hasBody) headers["Content-Type"] = "application/json";
      return fetch(`${baseUrl}/v1${path}`, {
        method: init.method ?? "GET",
        headers,
        ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
      });
    };

    const token = await getToken();
    let res = await send(token);
    if (res.status === 401) {
      const fresh = await recoverFrom401(token);
      if (fresh) res = await send(fresh);
    }
    noteResponseStatus(res.status);
    if (res.status === 204) return undefined as T;

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`);
    }
    return json as T;
  };
}
