import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, cachedGet } from "../lib/api";
import { mToYd } from "../lib/geo";

export default function Bag() {
  const [bag, setBag] = useState(null);
  const [stats, setStats] = useState([]);

  useEffect(() => {
    cachedGet("/bag", "bag").then(setBag).catch(() => {});
    api.get("/club-stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const save = (clubs) => {
    const next = { ...bag, clubs };
    setBag(next);
    api.put("/bag", next).then(() => localStorage.setItem("sgc_bag", JSON.stringify(next))).catch(() => toast.error("Save failed"));
  };

  const patchClub = (id, field, value) => {
    save(bag.clubs.map((c) => (c.id === id ? { ...c, [field]: Number(value) || 0 } : c)));
  };

  const acceptSuggestion = (clubName, yd) => {
    save(bag.clubs.map((c) => (c.name === clubName ? { ...c, carry: yd } : c)));
    toast.success(`${clubName} updated to ${yd} yd`);
  };

  if (!bag) return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-zinc-400">Loading…</div>;

  const statFor = (name) => stats.find((s) => s.club === name);

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-28" data-testid="bag-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5">
        <p className="overline-label text-[#D4AF37]">MY BAG</p>
        <h1 className="font-head text-2xl font-extrabold">Club Distances</h1>
        <p className="text-[11px] text-white/50 mt-1 font-bold">Carry distances in yards. Tap a number to edit.</p>
      </div>
      <div className="px-4 mt-4 space-y-2">
        {bag.clubs.map((c) => {
          const st = statFor(c.name);
          const suggested = st && st.count >= 5 ? Math.round(mToYd(st.typicalMeters)) : null;
          return (
            <div key={c.id} className="bg-white border border-zinc-200 rounded-2xl px-4 py-3" data-testid={`bag-club-${c.name.replace(/\s/g, "-").toLowerCase()}`}>
              <div className="flex items-center justify-between">
                <p className="font-head font-extrabold">{c.name}</p>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">CARRY</p>
                    <input data-testid={`club-carry-input-${c.name.replace(/\s/g, "-").toLowerCase()}`} type="number" value={c.carry}
                      onChange={(e) => patchClub(c.id, "carry", e.target.value)}
                      className="w-16 font-num text-xl text-right bg-transparent border-b border-zinc-200 focus:border-[#14532D] outline-none" />
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">TOTAL</p>
                    <input type="number" value={c.total} onChange={(e) => patchClub(c.id, "total", e.target.value)}
                      className="w-16 font-num text-xl text-right bg-transparent border-b border-zinc-200 focus:border-[#14532D] outline-none" />
                  </div>
                </div>
              </div>
              {st && (
                <p className="text-[10px] font-bold text-zinc-400 mt-1.5">
                  {st.count} shots recorded · typical {Math.round(mToYd(st.typicalMeters))} yd · longest {Math.round(mToYd(st.longestMeters))} yd
                </p>
              )}
              {suggested && Math.abs(suggested - c.carry) >= 4 && (
                <div className="mt-2 bg-[#14532D]/5 border border-[#14532D]/20 rounded-xl px-3 py-2 flex items-center justify-between" data-testid={`club-suggestion-${c.name.replace(/\s/g, "-").toLowerCase()}`}>
                  <p className="text-[11px] font-bold">Update carry to <span className="text-[#14532D]">{suggested} yd</span>? (from your shots)</p>
                  <button onClick={() => acceptSuggestion(c.name, suggested)} className="h-8 px-3 rounded-lg bg-[#14532D] text-white text-[10px] font-extrabold">YES</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
