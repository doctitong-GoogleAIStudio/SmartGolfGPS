export function resolveApiBase(apiUrl?: string, backendUrl?: string, allowLocalHttp = false): string | null {
  const raw = apiUrl?.trim() || backendUrl?.trim();if (!raw) return null;
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error("Use a backend URL without embedded credentials, query or fragment");
  const local = ["localhost", "127.0.0.1", "10.0.2.2", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(allowLocalHttp && local && url.protocol === "http:")) throw new Error("Backend connections require HTTPS");
  const base = raw.replace(/\/+$/, "");
  return apiUrl?.trim() || base.endsWith("/api") ? base : `${base}/api`;
}
