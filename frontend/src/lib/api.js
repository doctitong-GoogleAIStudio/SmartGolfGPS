import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;
export const api = axios.create({ baseURL: API });

export async function cachedGet(path, key) {
  try {
    const r = await api.get(path);
    try { localStorage.setItem("sgc_" + key, JSON.stringify(r.data)); } catch {}
    return r.data;
  } catch (e) {
    const c = localStorage.getItem("sgc_" + key);
    if (c) return JSON.parse(c);
    throw e;
  }
}

export const getActiveRound = () => {
  try { return JSON.parse(localStorage.getItem("sg_active_round")); } catch { return null; }
};
export const setActiveRound = (r) => {
  if (r) localStorage.setItem("sg_active_round", JSON.stringify(r));
  else localStorage.removeItem("sg_active_round");
};
