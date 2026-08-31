import { storage } from "@/src/utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;

async function req(method: string, path: string, body?: any) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (path: string) => req("GET", path),
  post: (path: string, body?: any) => req("POST", path, body),
  put: (path: string, body?: any) => req("PUT", path, body),
  del: (path: string, body?: any) => req("DELETE", path, body),
};

// Fetch with offline fallback to an AsyncStorage snapshot (JSON string).
export async function cachedGet<T = any>(path: string, key: string): Promise<T> {
  try {
    const data = await api.get(path);
    await storage.setItem("sgc_" + key, JSON.stringify(data));
    return data as T;
  } catch (e) {
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
