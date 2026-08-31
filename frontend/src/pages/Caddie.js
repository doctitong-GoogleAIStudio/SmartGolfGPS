import { useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { API } from "../lib/api";
import { Sparkle } from "@phosphor-icons/react";

export default function Caddie() {
  const { settings } = useSettings();
  const [advice, setAdvice] = useState("");
  const [loading, setLoading] = useState(false);
  const ctx = (() => { try { return JSON.parse(localStorage.getItem("sg_caddie_ctx")); } catch { return null; } })();

  const ask = async () => {
    if (!ctx) return;
    setLoading(true);
    setAdvice("");
    try {
      const res = await fetch(`${API}/caddie`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ctx),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          const ev = JSON.parse(data);
          if (ev.t) setAdvice((a) => a + ev.t);
          if (ev.error) setAdvice(ev.error);
        }
      }
    } catch {
      setAdvice("AI Caddie unavailable. Your rangefinder distances remain fully functional.");
    }
    setLoading(false);
  };

  if (settings.tournamentMode) {
    return (
      <div className="min-h-screen flex items-center justify-center px-8 pb-24 text-center" data-testid="caddie-tournament-screen">
        <div>
          <p className="font-head text-xl font-extrabold">Tournament Mode</p>
          <p className="text-sm text-zinc-500 mt-2">Only permitted distance information is displayed. The golfer is responsible for confirming the applicable Rules of Golf and local competition rules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-28" data-testid="caddie-screen">
      <div className="bg-[#14532D] text-white px-5 pt-6 pb-5">
        <p className="overline-label text-[#D4AF37]">SMART CADDIE</p>
        <h1 className="font-head text-2xl font-extrabold">Shot Strategy</h1>
      </div>

      {!ctx ? (
        <p className="text-sm text-zinc-500 text-center mt-16 px-8" data-testid="caddie-empty">Open the rangefinder MAP first and set a target — your caddie will pick up the situation from there.</p>
      ) : (
        <div className="px-4 mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[["ACTUAL", ctx.actualDistanceYards, "YD"], ["PLAYS LIKE*", ctx.playsLikeYards, "YD"], ["ELEVATION", ctx.elevationMeters != null ? `${ctx.elevationMeters > 0 ? "+" : ""}${ctx.elevationMeters}` : "--", "M"]].map(([l, v, u]) => (
              <div key={l} className="bg-white border border-zinc-200 rounded-xl py-3 text-center">
                <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">{l}</p>
                <p className="font-num text-2xl">{v ?? "--"}</p>
                <p className="text-[9px] font-bold text-zinc-400">{u}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["FRONT", ctx.frontGreenYards], ["CENTER", ctx.centerGreenYards], ["BACK", ctx.backGreenYards]].map(([l, v]) => (
              <div key={l} className="bg-white border border-zinc-200 rounded-xl py-2 text-center">
                <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">{l}</p>
                <p className="font-num text-lg">{v ?? "--"} <span className="text-[10px]">YD</span></p>
              </div>
            ))}
          </div>
          {ctx.recommendedClub && (
            <div className="bg-[#0F0F10] rounded-2xl p-5 text-white" data-testid="caddie-recommendation">
              <p className="overline-label text-[#D4AF37]">RECOMMENDED CLUB</p>
              <p className="font-num text-4xl mt-1 uppercase">{ctx.recommendedClub}</p>
              <p className="text-xs text-white/60 mt-1 font-bold">Typical carry: {ctx.clubCarryYards} yd</p>
            </div>
          )}
          {settings.aiCaddie && (
            <div className="bg-white border border-zinc-200 rounded-2xl p-5">
              <button data-testid="ask-ai-caddie-btn" onClick={ask} disabled={loading}
                className="w-full h-14 rounded-2xl bg-[#14532D] text-white font-extrabold tracking-widest flex items-center justify-center gap-2 disabled:opacity-60">
                <Sparkle size={20} weight="fill" className="text-[#D4AF37]" />
                {loading ? "THINKING…" : "ASK AI CADDIE"}
              </button>
              {advice && <p className="text-sm mt-4 leading-relaxed whitespace-pre-wrap" data-testid="ai-advice-text">{advice}</p>}
              <p className="text-[10px] text-zinc-400 mt-3">*Plays-like values are estimated playing distances, not surveyed measurements. AI advice uses only pre-calculated data.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
