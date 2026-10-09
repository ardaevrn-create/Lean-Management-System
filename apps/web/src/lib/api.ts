/** Tüm API çağrıları bu istemci üzerinden yapılır (token ekleme, 401'de refresh). */
import type { TokenPair } from "@lean/shared";

// Yayında web ve API aynı adres üzerinden konuşur (Next.js /api/v1 → API_ORIGIN aktarımı).
// Yerel geliştirmede API ayrı portta çalışır.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "production" ? "/api/v1" : "http://localhost:4000/api/v1");

const ACCESS_KEY = "lean.accessToken";
const REFRESH_KEY = "lean.refreshToken";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* ---------- Token deposu ---------- */
function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* yok say */
  }
}

export const tokens = {
  get access() {
    return read(ACCESS_KEY);
  },
  get refresh() {
    return read(REFRESH_KEY);
  },
  set(pair: TokenPair) {
    write(ACCESS_KEY, pair.accessToken);
    write(REFRESH_KEY, pair.refreshToken);
  },
  clear() {
    write(ACCESS_KEY, null);
    write(REFRESH_KEY, null);
  },
};

type LogoutListener = () => void;
let logoutListener: LogoutListener | null = null;
/** AuthProvider oturum düşünce yönlendirme yapabilsin diye kaydolur. */
export function onSessionExpired(fn: LogoutListener | null) {
  logoutListener = fn;
}

function forceLogout() {
  tokens.clear();
  if (logoutListener) logoutListener();
  else if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
}

/* ---------- Yardımcılar ---------- */
export type QueryParams = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* gövde yok */
  }
  const raw = body?.message;
  const message = Array.isArray(raw) ? raw.join(", ") : (raw ?? res.statusText ?? "Error");
  return new ApiError(res.status, String(message), body?.code, body?.details);
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refreshToken = tokens.refresh;
  if (!refreshToken) return false;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      tokens.set((await res.json()) as TokenPair);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

interface RequestOptions {
  method?: string;
  query?: QueryParams;
  body?: unknown;
  formData?: FormData;
  /** Giriş gibi 401'de refresh denenmemesi gereken çağrılar */
  skipAuth?: boolean;
}

async function rawFetch(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const access = opts.skipAuth ? null : tokens.access;
  if (access) headers.Authorization = `Bearer ${access}`;
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(`${API_URL}${path}${buildQuery(opts.query)}`, { method: opts.method ?? "GET", headers, body });
}

async function execute(path: string, opts: RequestOptions): Promise<Response> {
  let res: Response;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "NETWORK_ERROR");
  }
  if (res.status === 401 && !opts.skipAuth) {
    if (await tryRefresh()) {
      try {
        res = await rawFetch(path, opts);
      } catch {
        throw new ApiError(0, "NETWORK_ERROR", "NETWORK_ERROR");
      }
    }
    if (res.status === 401) {
      forceLogout();
      throw await toApiError(res);
    }
  }
  if (!res.ok) {
    const err = await toApiError(res);
    if (err.status === 403 && err.code === "PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined") {
      if (window.location.pathname !== "/change-password") window.location.href = "/change-password";
    }
    throw err;
  }
  return res;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await execute(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: <T>(path: string, query?: QueryParams) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown, query?: QueryParams) => request<T>(path, { method: "POST", body, query }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  del: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", formData }),
  login: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body, skipAuth: true }),
  /** Dosya indirir (xlsx vb.) ve tarayıcıya kaydettirir. */
  async download(path: string, filename: string, query?: QueryParams) {
    const res = await execute(path, { query });
    saveBlob(await res.blob(), filename);
  },
};

export const { get, post, patch, put, del, upload, download: downloadFile } = api;
export const download = api.download;
