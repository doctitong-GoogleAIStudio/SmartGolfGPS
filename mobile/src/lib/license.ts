import * as Crypto from "expo-crypto";
import * as Application from "expo-application";
import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";

// ---------------------------------------------------------------------------
// Offline device-locked activation.
//
// The SAME algorithm runs in the standalone Activation Generator
// (/app/tools/activation-generator.html) and here in the app, so the owner can
// mint a code for a Device ID with NO server or internet. A code is derived
// from the Device ID + a shared SECRET, so it only unlocks that one phone.
// ---------------------------------------------------------------------------

// Shared secret. MUST be identical to SECRET in activation-generator.html.
export const ACTIVATION_SECRET = "SG-GPS-2026::a7Fq9zLpW3xR6mB2::VINCENT-CADDIE";

export const TRIAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const OWNER_EMAIL = "docvincent2022@yahoo.com";

const K_TRIAL_START = "lic_trial_start";
const K_ACTIVATED = "lic_activated";
const K_DEVICE_ID = "lic_device_id";

function normalize(s: string) {
  return (s || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

// Stable, human-readable hardware device id. Persisted after first resolve so
// it never changes for this install.
export async function getDeviceId(): Promise<string> {
  const cached = await storage.secureGet<string>(K_DEVICE_ID, "");
  if (cached) return cached;

  let raw = "";
  try {
    if (Platform.OS === "android") {
      raw = (Application.getAndroidId?.() as string) || "";
    } else if (Platform.OS === "ios") {
      raw = (await Application.getIosIdForVendorAsync()) || "";
    }
  } catch {
    raw = "";
  }
  if (!raw) raw = Crypto.randomUUID();

  // Fingerprint to a compact, typo-resistant 12-char code shown to the user.
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  const id = hex.slice(0, 12).toUpperCase();
  const formatted = `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8, 12)}`;
  await storage.secureSet(K_DEVICE_ID, formatted);
  return formatted;
}

// Deterministic activation code for a given device id.
export async function activationCodeFor(deviceId: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${normalize(deviceId)}|${ACTIVATION_SECRET}`
  );
  const c = hex.slice(0, 16).toUpperCase();
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`;
}

export async function validateCode(deviceId: string, input: string): Promise<boolean> {
  const expected = await activationCodeFor(deviceId);
  return normalize(input) === normalize(expected);
}

export type LicenseState = {
  deviceId: string;
  activated: boolean;
  trialStart: number;
  now: number;
};

export async function loadLicense(): Promise<LicenseState> {
  const deviceId = await getDeviceId();
  let trialStart = await storage.secureGet<number>(K_TRIAL_START, 0);
  if (!trialStart) {
    trialStart = Date.now();
    await storage.secureSet(K_TRIAL_START, trialStart);
  }
  const activated = (await storage.secureGet<boolean>(K_ACTIVATED, false)) === true;
  return { deviceId, activated, trialStart, now: Date.now() };
}

export async function persistActivated() {
  await storage.secureSet(K_ACTIVATED, true);
}

export function trialRemainingMs(trialStart: number, now = Date.now()) {
  return Math.max(0, trialStart + TRIAL_MS - now);
}
