import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, cachedGet } from "../lib/api";

const Ctx = createContext(null);

const DEFAULTS = {
  distanceUnit: "yd", windUnit: "kmh", tempUnit: "C",
  elevationAdj: true, windAdj: true, tempAdj: false,
  aiCaddie: true, tournamentMode: false, gpsTracking: true,
};

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    cachedGet("/settings", "settings").then((s) => setSettings({ ...DEFAULTS, ...s })).catch(() => {});
  }, []);

  const update = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      api.put("/settings", { id: "default", ...next }).catch(() => {});
      try { localStorage.setItem("sgc_settings", JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export const useSettings = () => useContext(Ctx);
