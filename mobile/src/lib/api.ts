import { storage } from "@/src/utils/storage";
import { serviceSession } from "./serviceSession";
import { ServiceError } from "./serviceSessionCore";
import { storageScope } from "./storageScope";

export let API = serviceSession.apiBase;
export function refreshApiConnection() { API = serviceSession.apiBase; }
export const API_TOKEN_KEY = "sg_api_access_token_v1"; // Old key retained; no migration/deletion.

/** Native service sessions use a dedicated secure record, bound to the API and account. */
export async function apiHeaders(json = false): Promise<Record<string, string>> {
  await serviceSession.restore();
  const token = serviceSession.token;
  return { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function req(method: string, path: string, body?: any) {
  await serviceSession.restore();
  refreshApiConnection();
  if (!API) throw new ServiceError("Connect the deployed golf API in Settings → Golf account.");
  const publicDirectory = method === "GET" && path === "/courses/directory";
  if (!publicDirectory && !serviceSession.token) throw new ServiceError("Sign in to the golf service in Settings → Golf account.", 401);
  const scope = storageScope();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), publicDirectory ? 60000 : 15000);
  let res: Response;
  try { res = await fetch(`${API}${path}`, {
    method,
    headers: await apiHeaders(body != null),
    redirect: "error",
    body: body ? JSON.stringify(body) : undefined,
    signal: abort.signal,
  });
    const text = await res.text();
    if (scope !== storageScope()) throw new ServiceError("The golf session changed. Please retry.", 409);
    if (!res.ok) throw new ServiceError(res.status === 401 ? "Your golf session expired. Sign in again." :
      res.status === 403 ? "Your account is not authorized for this action." : `${method} ${path} → ${res.status}`, res.status);
    return text ? JSON.parse(text) : null;
  } finally { clearTimeout(timeout); }
}

export const api = {
  get: (path: string) => req("GET", path),
  post: (path: string, body?: any) => req("POST", path, body),
  put: (path: string, body?: any) => req("PUT", path, body),
  del: (path: string, body?: any) => req("DELETE", path, body),
};

// Fetch with offline fallback to an AsyncStorage snapshot (JSON string).
export async function cachedGet<T = any>(path: string, key: string): Promise<T> {
  const scope = storageScope();
  try {
    const data = await api.get(path);
    await storage.setItem("sgc_" + key, JSON.stringify(data));
    return data as T;
  } catch (e) {
    if (scope !== storageScope() || (e instanceof ServiceError && [401, 403, 409].includes(e.status))) throw e;
    const c = await storage.getItem<string>("sgc_" + key, "");
    if (c) return JSON.parse(c) as T;
    throw e;
  }
}

export type ActiveRound = { id: string; courseId: string; currentHole: number } | null;

export async function getActiveRound(): Promise<ActiveRound> {
  const c = await storage.getItem<string>("sg_active_round", "");
  if (!c) return null;
  try {
    return JSON.parse(c);
  } catch {
    return null;
  }
}

export async function setActiveRound(r: ActiveRound) {
  if (r) await storage.setItem("sg_active_round", JSON.stringify(r));
  else await storage.removeItem("sg_active_round");
}
