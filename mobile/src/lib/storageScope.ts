let prefix = "";
export function storageKey(key: string): string {
  // Captured keys keep queued/background work in its original namespace.
  if (key.startsWith("sg_legacy_v1:")) return key.slice("sg_legacy_v1:".length);
  return key.startsWith("sg_account_v1:") || key.startsWith("sg_signed_out:") ? key : `${prefix}${key}`;
}
export function captureStorageKey(key: string): string { return prefix ? storageKey(key) : `sg_legacy_v1:${key}`; }
export function storageScope(): string { return prefix; }
export function setStorageScope(value: string) { prefix = value; }
export function accountScope(base: string, userId: string): string {
  return `sg_account_v1:${encodeURIComponent(base)}:${encodeURIComponent(userId)}:`;
}
