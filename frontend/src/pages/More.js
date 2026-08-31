import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useSettings } from "../context/SettingsContext";
import { api } from "../lib/api";
import { MapPin, ClockCounterClockwise, ChartBar, CaretRight } from "@phosphor-icons/react";

function Toggle({ label, value, onChange, testId, desc }) {
  return (
    <button data-testid={testId} onClick={() => onChange(!value)} className="w-full flex items-center justify-between bg-white border border-zinc-200 rounded-2xl px-4 py-3.5 text-left">
      <div>
        <p className="font-bold text-sm">{label}</p>
        {desc && <p className="text-[10px] text-zinc-400 font-semibold">{desc}</p>}
      </div>
      <div className={`w-12 h-7 rounded-full p-1 transition-colors ${value ? "bg-[#14532D]" : "bg-zinc-300"}`}>
        <div className={`h-5 w-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : ""}`} />
      </div>
    </button>
  );
}

function Segment({ label, options, value, onChange, testId }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-2xl px-4 py-3.5 flex items-center justify-between">
      <p className="font-bold text-sm">{label}</p>
      <div className="flex gap-1">
        {options.map(([v, l]) => (
          <button key={v} data-testid={`${testId}-${v}`} onClick={() => onChange(v)}
            className={`px-3 h-9 rounded-lg text-xs font-extrabold ${value === v ? "bg-[#14532D] text-white" : "bg-zinc-100 text-zinc-500"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export default function More() {
  const nav = useNavigate();
  const { settings, update } = useSettings();

  const wipe = async (what) => {
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    if (what === "all rounds & shots") await api.delete("/data/all");
    else if (what === "shot history") await api.delete("/shots");
    toast.success("Deleted");
  };

  const Link = ({ label, path, icon: Icon, testId }) => (
    <button data-testid={testId} onClick={() => nav(path)} className="w-full flex items-center justify-between bg-white border border-zinc-200 rounded-2xl px-4 py-4">
      <span className="flex items-center gap-3 font-bold text-sm"><Icon size={20} className="text-[#14532D]" /> {label}</span>
      <CaretRight size={16} className="text-zinc-400" />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-28" data-testid="more-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5">
        <p className="overline-label text-[#D4AF37]">MORE</p>
        <h1 className="font-head text-2xl font-extrabold">Settings</h1>
      </div>
      <div className="px-4 mt-4 space-y-2.5">
        <Link label="Courses & Course Editor" path="/courses" icon={MapPin} testId="more-courses-link" />
        <Link label="Round History" path="/history" icon={ClockCounterClockwise} testId="more-history-link" />
        <Link label="Statistics" path="/stats" icon={ChartBar} testId="more-stats-link" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">UNITS</p>
        <Segment label="Distance" options={[["yd", "YARDS"], ["m", "METERS"]]} value={settings.distanceUnit} onChange={(v) => update({ distanceUnit: v })} testId="setting-unit" />
        <Segment label="Wind" options={[["kmh", "KM/H"], ["mph", "MPH"]]} value={settings.windUnit} onChange={(v) => update({ windUnit: v })} testId="setting-wind-unit" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">GPS</p>
        <Toggle label="GPS Tracking" desc="Live position, navigation & path recording. Disable when not playing." value={settings.gpsTracking !== false} onChange={(v) => update({ gpsTracking: v })} testId="setting-gps-tracking" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">PLAYS-LIKE ADJUSTMENTS (ESTIMATES)</p>
        <Toggle label="Elevation Adjustment" value={settings.elevationAdj} onChange={(v) => update({ elevationAdj: v })} testId="setting-elevation-adj" />
        <Toggle label="Wind Adjustment" value={settings.windAdj} onChange={(v) => update({ windAdj: v })} testId="setting-wind-adj" />
        <Toggle label="Temperature Adjustment" desc="Applied when Auto Weather is on" value={settings.tempAdj} onChange={(v) => update({ tempAdj: v })} testId="setting-temp-adj" />
        <Toggle label="AI Caddie" value={settings.aiCaddie} onChange={(v) => update({ aiCaddie: v })} testId="setting-ai-caddie" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">COMPETITION</p>
        <Toggle label="Tournament Mode" desc="Straight-line distance only. Disables plays-like, wind & AI. Golfer must confirm local rules." value={settings.tournamentMode} onChange={(v) => update({ tournamentMode: v })} testId="setting-tournament-mode" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">DEVELOPER</p>
        <Toggle label="Developer Test Mode" desc="Shows raw coordinates, meters, bearing & API status on map" value={localStorage.getItem("sg_dev") === "1"} onChange={(v) => { localStorage.setItem("sg_dev", v ? "1" : "0"); window.dispatchEvent(new Event("storage")); toast.success(v ? "Dev mode on" : "Dev mode off"); }} testId="setting-dev-mode" />

        <p className="overline-label text-zinc-400 pt-3 pl-1">PRIVACY</p>
        <button data-testid="delete-shots-btn" onClick={() => wipe("shot history")} className="w-full h-12 rounded-2xl bg-white border border-red-200 text-red-500 font-bold text-sm">DELETE SHOT HISTORY</button>
        <button data-testid="delete-all-btn" onClick={() => wipe("all rounds & shots")} className="w-full h-12 rounded-2xl bg-white border border-red-200 text-red-500 font-bold text-sm">DELETE ALL ROUNDS & LOCATION HISTORY</button>
      </div>
    </div>
  );
}
