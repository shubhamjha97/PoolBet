// Typed API client. Talks to the FastAPI backend at same-origin root paths
// (proxied to :8000 in dev via vite.config.ts).

const TOKEN_KEY = "pb_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function detailToMessage(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (detail == null) return `Request failed (${status})`;
  try {
    return JSON.stringify(detail);
  } catch {
    return `Request failed (${status})`;
  }
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json", ...extraHeaders };
  const tok = getToken();
  if (tok) headers.authorization = "Bearer " + tok;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, detailToMessage((data as { detail?: unknown } | null)?.detail, res.status));
  }
  return data as T;
}

// Multipart upload (photo evidence) — no JSON content-type.
export async function upload<T = unknown>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.authorization = "Bearer " + tok;
  const res = await fetch(path, { method: "POST", headers, body: fd });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, detailToMessage((data as { detail?: unknown } | null)?.detail, res.status));
  return data as T;
}
