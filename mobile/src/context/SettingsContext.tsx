import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, cachedGet } from "@/src/lib/api";
import { storage } from "@/src/utils/storage";

export type Settings = {
  distanceUnit: string;
  windUnit: string;
  tempUnit: string;
  elevationAdj: boolean;
  windAdj: boolean;
  tempAdj: boolean;
  aiCaddie: boolean;
  tournamentMode: boolean;
  gpsTracking: boolean;
};

const DEFAULTS: Settings = {
  distanceUnit: "yd",
  windUnit: "kmh",
  tempUnit: "C",
  elevationAdj: true,
  windAdj: true,
  tempAdj: false,
  aiCaddie: true,
  tournamentMode: false,
  gpsTracking: true,
};

type Ctx = { settings: Settings; update: (patch: Partial<Settings>) => void };
const SettingsCtx = createContext<Ctx>({ settings: DEFAULTS, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    cachedGet<Partial<Settings>>("/settings", "settings")
      .then((s) => setSettings((prev) => ({ ...prev, ...s })))
      .catch(() => {});
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      api.put("/settings", { id: "default", ...next }).catch(() => {});
      storage.setItem("sgc_settings", JSON.stringify(next));
      return next;
    });
  }, []);

  return <SettingsCtx.Provider value={{ settings, update }}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);
