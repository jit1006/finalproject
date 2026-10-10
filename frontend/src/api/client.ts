// Thin fetch wrapper. Cookies (HttpOnly session) sent with credentials:"include".
const BASE = "/api/v1";

export interface ApiErrorShape {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  correlationId?: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, body: ApiErrorShape) {
    super(body.message);
    this.code = body.code;
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: ApiErrorShape = { code: "UNKNOWN", message: res.statusText };
    try {
      const json = await res.json();
      if (json?.error) body = json.error;
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
};
