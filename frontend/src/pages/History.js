import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { ArrowLeft } from "@phosphor-icons/react";

export default function History() {
  const nav = useNavigate();
  const [rounds, setRounds] = useState([]);

  useEffect(() => {
    api.get("/rounds?status=completed").then((r) => setRounds(r.data)).catch(() => {});
  }, []);

  const summary = (r) => {
    const played = r.scores.filter((s) => s.score);
    const total = played.reduce((a, s) => a + s.score, 0);
    const par = played.reduce((a, s) => a + s.par, 0);
    return { total, toPar: total - par, holes: played.length };
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="history-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5 flex items-center gap-3">
        <button data-testid="history-back-btn" onClick={() => nav("/")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div>
          <p className="overline-label text-[#D4AF37]">HISTORY</p>
          <h1 className="font-head text-2xl font-extrabold">Round History</h1>
        </div>
      </div>
      <div className="px-4 mt-4 space-y-2.5">
        {rounds.length === 0 && <p className="text-sm text-zinc-400 font-bold text-center mt-12" data-testid="history-empty">No completed rounds yet.</p>}
        {rounds.map((r) => {
          const s = summary(r);
          return (
            <button key={r.id} data-testid={`history-round-${r.id}`} onClick={() => nav(`/rounds/${r.id}`)}
              className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-4 flex items-center justify-between text-left">
              <div>
                <p className="font-extrabold text-sm">{r.courseName}</p>
                <p className="text-[10px] text-zinc-400 font-bold">{new Date(r.startedAt).toLocaleDateString()} · {s.holes} holes · {r.player}</p>
              </div>
              <div className="text-right">
                <p className="font-num text-3xl">{s.total || "-"}</p>
                <p className={`text-[10px] font-extrabold ${s.toPar > 0 ? "text-red-500" : "text-[#22C55E]"}`}>{s.toPar > 0 ? `+${s.toPar}` : s.toPar}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
