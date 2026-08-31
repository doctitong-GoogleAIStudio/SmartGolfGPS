import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { AppState } from "react-native";
import {
  loadLicense,
  persistActivated,
  validateCode,
  trialRemainingMs,
  TRIAL_MS,
} from "@/src/lib/license";

type Ctx = {
  ready: boolean;
  deviceId: string;
  activated: boolean;
  remainingMs: number;
  trialExpired: boolean;
  locked: boolean; // trial over and not activated -> app gated
  activate: (code: string) => Promise<boolean>;
};

const LicenseCtx = createContext<Ctx>({
  ready: false,
  deviceId: "",
  activated: false,
  remainingMs: TRIAL_MS,
  trialExpired: false,
  locked: false,
  activate: async () => false,
});

export function LicenseProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [activated, setActivated] = useState(false);
  const [trialStart, setTrialStart] = useState(0);
  const [remainingMs, setRemainingMs] = useState(TRIAL_MS);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const st = await loadLicense();
    setDeviceId(st.deviceId);
    setActivated(st.activated);
    setTrialStart(st.trialStart);
    setRemainingMs(trialRemainingMs(st.trialStart));
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // 1s countdown while in trial.
  useEffect(() => {
    if (activated || !trialStart) return;
    tick.current = setInterval(() => setRemainingMs(trialRemainingMs(trialStart)), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [activated, trialStart]);

  const activate = useCallback(
    async (code: string) => {
      const ok = await validateCode(deviceId, code);
      if (ok) {
        await persistActivated();
        setActivated(true);
      }
      return ok;
    },
    [deviceId]
  );

  const trialExpired = !activated && remainingMs <= 0;
  const locked = trialExpired;

  return (
    <LicenseCtx.Provider
      value={{ ready, deviceId, activated, remainingMs, trialExpired, locked, activate }}
    >
      {children}
    </LicenseCtx.Provider>
  );
}

export const useLicense = () => useContext(LicenseCtx);
