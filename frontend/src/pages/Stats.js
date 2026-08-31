import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { mToYd } from "../lib/geo";
import { ArrowLeft } from "@phosphor-icons/react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

export default function Stats() {
  const nav = useNavigate();
  const { settings } = useSettings();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  if (!stats) return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-zinc-400">Loading…</div>;

  const drv = stats.avgDriverMeters ? (settings.distanceUnit === "yd" ? `${Math.round(mToYd(stats.avgDriverMeters))} yd` : `${Math.round(stats.avgDriverMeters)} m`) : "--";
  const chartData = [...(stats.recentRounds || [])].reverse().map((r, i) => ({ name: `R${i + 1}`, score: r.score, par: r.par }));

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="stats-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5 flex items-center gap-3">
        <button data-testid="stats-back-btn" onClick={() => nav("/")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div>
          <p className="overline-label text-[#D4AF37]">STATISTICS</p>
          <h1 className="font-head text-2xl font-extrabold">My Game</h1>
        </div>
      </div>

      <div className="px-4 mt-4 grid grid-cols-2 gap-2.5">
        {[["ROUNDS PLAYED", stats.roundsPlayed], ["AVG SCORE", stats.avgScore ?? "--"], ["BEST SCORE", stats.bestScore ?? "--"], ["AVG PUTTS", stats.avgPutts ?? "--"], ["FAIRWAY %", stats.avgFairwayPct != null ? `${stats.avgFairwayPct}%` : "--"], ["GIR %", stats.avgGirPct != null ? `${stats.avgGirPct}%` : "--"], ["AVG DRIVER", drv], ["SHOTS TRACKED", stats.totalShots]].map(([l, v]) => (
          <div key={l} className="bg-white border border-zinc-200 rounded-2xl py-4 text-center" data-testid={`stat-${l.replace(/[\s%]/g, "-").toLowerCase()}`}>
            <p className="text-[9px] font-extrabold tracking-widest text-zinc-400">{l}</p>
            <p className="font-num text-3xl mt-1">{v}</p>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="mx-4 mt-4 bg-white border border-zinc-200 rounded-2xl p-4">
          <p className="overline-label text-zinc-400 mb-3">RECENT ROUNDS</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 700 }} />
                <YAxis hide domain={["dataMin - 5", "dataMax + 5"]} />
                <Tooltip />
                <Bar dataKey="score" fill="#14532D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
