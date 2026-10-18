import { resolveApiBase } from "./backendConfig";
import { accountScope } from "./storageScope";

export const SERVICE_SESSION_KEY = "sg_service_session_v1";
type User = { id: string; name: string; email: string };
export type ServiceSession = { apiBase: string; user: User; token: string | null; expiresAt: string };
type Store = { secureGet(key: string, fallback: string): Promise<string | null>; secureSet(key: string, value: string): Promise<boolean> };
export class ServiceError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

/** One account binding per installation until account/round migration is implemented. */
export class ServiceSessionManager {
  session: ServiceSession | null = null;
  private restored: Promise<void> | null = null;
  constructor(private store: Store, private fetcher: typeof fetch, public defaultBase: string | null,
              private localHttp = false, private applyScope: (scope: string) => void = () => {},
              private deadlines = { request: 15000, probe: 60000 }) {}
  get apiBase() { return this.session?.apiBase || this.defaultBase; }
  get scope() { return this.session ? (this.session.token ? accountScope(this.session.apiBase, this.session.user.id) : "sg_signed_out:") : ""; }
  get token() {
    if (!this.session?.token || Date.parse(this.session.expiresAt) <= Date.now()) return null;
    return this.session.token;
  }
  restore(): Promise<void> {
    if (!this.restored) this.restored = this.load();
    return this.restored;
  }
  private async load() {
    const raw = await this.store.secureGet(SERVICE_SESSION_KEY, "");
    if (!raw) return;
    const saved = JSON.parse(raw);
    const base = resolveApiBase(saved.apiBase, undefined, this.localHttp);
    if (!base || !saved.user?.id || typeof saved.user.id !== "string" || typeof saved.user.name !== "string" ||
        typeof saved.user.email !== "string" || !Number.isFinite(Date.parse(saved.expiresAt)) ||
        !(saved.token === null || (typeof saved.token === "string" && saved.token.length >= 20 && saved.token.length <= 512))) {
      throw new ServiceError("Saved service connection needs review. Existing data has been retained.");
    }
    this.session = { ...saved, apiBase: base };
    this.applyScope(this.scope);
  }
  private async request(base: string, path: string, init: RequestInit = {}, deadlineMs = this.deadlines.request) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, deadlineMs);
    try {
      const response = await this.fetcher(base + path, { ...init, redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...init.headers } });
      const text = await response.text();
      let data: any;
      try { data = text ? JSON.parse(text) : null; } catch { throw new ServiceError("The address did not return a golf API response."); }
      if (!response.ok) throw new ServiceError(response.status === 401 ? "Email or password is incorrect, or the session expired." :
        response.status === 429 ? "Too many sign-in attempts. Try again later." : "Golf service is unavailable. Check its deployment and database.", response.status);
      return data;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (timedOut) throw new ServiceError("Connection timed out. The service may be waking up or your connection may be weak. Check Wi-Fi or mobile data, then try again.", 408);
      throw new ServiceError("Could not reach the golf service. Check the API address and your Wi-Fi or mobile data, then try again.");
    } finally { clearTimeout(timeout); }
  }
  async probe(raw: string) {
    const base = resolveApiBase(raw, undefined, this.localHttp);
    if (!base) throw new ServiceError("Enter the complete golf API address.");
    // An anonymous readiness check can include a hosting cold start. Credentials
    // are sent only after this succeeds; sign-in requests are never auto-retried.
    const result = await this.request(base, "/health", {}, this.deadlines.probe);
    if (result?.service !== "smart-golf-gps" || result.apiVersion !== "1" || result.authentication !== "bearer" ||
        result.databaseReady !== true || result.status !== "ok") throw new ServiceError("This service does not support this app's authenticated golf API.");
    return base;
  }
  async signIn(raw: string, email: string, password: string) {
    await this.restore();
    const base = await this.probe(raw);
    if (this.session && (base !== this.session.apiBase || email.trim().toLowerCase() !== this.session.user.email.toLowerCase())) {
      throw new ServiceError("This installation is linked to another golf account. Its saved data is retained; account transfer requires a migration.");
    }
    const result = await this.request(base, "/auth/token", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, deviceName: "Smart Golf GPS Android" }) });
    if (result?.tokenType !== "Bearer" || typeof result.token !== "string" || result.token.length < 20 || result.token.length > 512 ||
        !result.user?.id || typeof result.user.id !== "string" || typeof result.user.name !== "string" || typeof result.user.email !== "string" ||
        !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now() ||
        (this.session && result.user.id !== this.session.user.id)) throw new ServiceError("The sign-in response was invalid. Existing data was retained.");
    const session: ServiceSession = { apiBase: base, user: result.user, token: result.token, expiresAt: result.expiresAt };
    if (!await this.store.secureSet(SERVICE_SESSION_KEY, JSON.stringify(session))) throw new ServiceError("The session could not be saved securely. Sign-in was not completed.");
    this.session = session;
    this.applyScope(this.scope);
  }
  async signOut(): Promise<boolean> {
    if (!this.session) return true;
    const previous = this.session;
    const next = { ...previous, token: null };
    if (!await this.store.secureSet(SERVICE_SESSION_KEY, JSON.stringify(next))) throw new ServiceError("Could not clear the saved session. Please try again.");
    this.session = next;
    this.applyScope(this.scope);
    try {
      if (previous.token) await this.request(previous.apiBase, "/auth/token", { method: "DELETE", headers: { Authorization: `Bearer ${previous.token}` } });
      return true;
    } catch { return false; }
  }
}
