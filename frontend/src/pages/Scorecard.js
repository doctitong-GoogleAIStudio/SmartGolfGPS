import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, getActiveRound, setActiveRound } from "../lib/api";
import { House, Minus, Plus } from "@phosphor-icons/react";

function Stepper({ value, onChange, min = 0, testId }) {
  return (
    <div className="flex items-center gap-2">
      <button data-testid={`${testId}-minus`} onClick={() => onChange(Math.max(min, (value || 0) - 1))} className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center"><Minus size={16} weight="bold" /></button>
      <span className="font-num text-2xl w-8 text-center" data-testid={`${testId}-value`}>{value ?? "-"}</span>
      <button data-testid={`${testId}-plus`} onClick={() => onChange((value || 0) + 1)} className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center"><Plus size={16} weight="bold" /></button>
    </div>
  );
}

export default function Scorecard() {
  const nav = useNavigate();
  const active = getActiveRound();
  const [round, setRound] = useState(null);
  const [holeIdx, setHoleIdx] = useState(0);

  useEffect(() => {
    if (!active) return;
    api.get(`/rounds/${active.id}`).then((r) => {
      setRound(r.data);
      setHoleIdx((r.data.currentHole || 1) - 1);
    }).catch(() => toast.error("Could not load round"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-8 pb-24" data-testid="no-round-screen">
        <p className="font-head text-xl font-extrabold text-center">No active round</p>
        <button data-testid="score-start-round-btn" onClick={() => nav("/start-round")} className="h-14 px-8 rounded-2xl bg-[#14532D] text-white font-extrabold tracking-widest">START ROUND</button>
      </div>
    );
  }
  if (!round) return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-zinc-400">Loading…</div>;

  const scores = round.scores;
  const s = scores[holeIdx];

  const patch = (p) => {
    const next = scores.map((x, i) => (i === holeIdx ? { ...x, ...p } : x));
    setRound({ ...round, scores: next });
    api.put(`/rounds/${round.id}`, { scores: next }).catch(() => toast.error("Save failed (offline?)"));
  };

  const played = scores.filter((x) => x.score);
  const tot = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const front = scores.slice(0, 9).filter((x) => x.score);
  const back = scores.slice(9).filter((x) => x.score);

  const endRound = async () => {
    await api.put(`/rounds/${round.id}`, { status: "completed" });
    setActiveRound(null);
    toast.success("Round completed!");
    nav(`/rounds/${round.id}`);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-28" data-testid="scorecard-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <p className="overline-label text-[#D4AF37]">SCORECARD</p>
          <h1 className="font-head text-xl font-extrabold">{round.courseName}</h1>
        </div>
        <button data-testid="score-home-btn" onClick={() => nav("/")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><House size={18} /></button>
      </div>

      {/* Current hole editor */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm" data-testid="hole-score-editor">
        <div className="flex items-center justify-between">
          <select data-testid="score-hole-select" value={holeIdx} onChange={(e) => setHoleIdx(Number(e.target.value))} className="font-head text-lg font-extrabold bg-transparent">
            {scores.map((x, i) => <option key={i} value={i}>HOLE {x.hole} · PAR {x.par}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div><p className="overline-label text-zinc-400 mb-1">SCORE</p><Stepper value={s.score} onChange={(v) => patch({ score: v })} min={1} testId="score" /></div>
          <div><p className="overline-label text-zinc-400 mb-1">PUTTS</p><Stepper value={s.putts} onChange={(v) => patch({ putts: v })} testId="putts" /></div>
          <div><p className="overline-label text-zinc-400 mb-1">PENALTY</p><Stepper value={s.penalty} onChange={(v) => patch({ penalty: v })} testId="penalty" /></div>
          <div>
            <p className="overline-label text-zinc-400 mb-1">FAIRWAY / GIR</p>
            <div className="flex gap-2">
              <button data-testid="fairway-toggle" onClick={() => patch({ fairway: s.fairway === true ? false : true })}
                className={`h-10 flex-1 rounded-lg text-xs font-extrabold ${s.fairway === true ? "bg-[#14532D] text-white" : s.fairway === false ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-500"}`}>FW {s.fairway === true ? "✓" : s.fairway === false ? "✕" : "?"}</button>
              <button data-testid="gir-toggle" onClick={() => patch({ gir: s.gir === true ? false : true })}
                className={`h-10 flex-1 rounded-lg text-xs font-extrabold ${s.gir === true ? "bg-[#14532D] text-white" : s.gir === false ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-500"}`}>GIR {s.gir === true ? "✓" : s.gir === false ? "✕" : "?"}</button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button data-testid="prev-hole-score-btn" disabled={holeIdx === 0} onClick={() => setHoleIdx(holeIdx - 1)} className="flex-1 h-12 rounded-xl bg-zinc-100 font-bold text-sm disabled:opacity-40">‹ PREV</button>
          <button data-testid="next-hole-score-btn" disabled={holeIdx === scores.length - 1} onClick={() => setHoleIdx(holeIdx + 1)} className="flex-1 h-12 rounded-xl bg-[#14532D] text-white font-bold text-sm disabled:opacity-40">NEXT HOLE ›</button>
        </div>
      </div>

      {/* Totals */}
      <div className="mx-4 mt-4 grid grid-cols-4 gap-2" data-testid="score-totals">
        {[["TOTAL", tot(played, (x) => x.score) || "-"], ["TO PAR", played.length ? (tot(played, (x) => x.score) - tot(played, (x) => x.par) >= 0 ? "+" : "") + (tot(played, (x) => x.score) - tot(played, (x) => x.par)) : "-"], ["FRONT 9", tot(front, (x) => x.score) || "-"], ["BACK 9", tot(back, (x) => x.score) || "-"]].map(([l, v]) => (
          <div key={l} className="bg-white border border-zinc-200 rounded-xl py-2 text-center">
            <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">{l}</p>
            <p className="font-num text-xl">{v}</p>
          </div>
        ))}
      </div>

      {/* Full grid */}
      <div className="mx-4 mt-4 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="bg-[#0F0F10] text-white"><th className="py-2 px-2 text-left">HOLE</th><th>PAR</th><th>SCORE</th><th>PUTTS</th><th>FW</th><th>GIR</th></tr></thead>
          <tbody>
            {scores.map((x, i) => (
              <tr key={i} data-testid={`score-row-${x.hole}`} onClick={() => setHoleIdx(i)} className={`text-center cursor-pointer ${i % 2 ? "bg-zinc-50" : ""} ${i === holeIdx ? "bg-[#14532D]/10" : ""}`}>
                <td className="py-1.5 px-2 text-left font-extrabold">{x.hole}</td>
                <td>{x.par}</td>
                <td className={`font-extrabold ${x.score ? (x.score < x.par ? "text-[#22C55E]" : x.score > x.par ? "text-red-500" : "") : "text-zinc-300"}`}>{x.score || "-"}</td>
                <td>{x.putts ?? "-"}</td>
                <td>{x.fairway === true ? "✓" : x.fairway === false ? "✕" : "-"}</td>
                <td>{x.gir === true ? "✓" : x.gir === false ? "✕" : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mx-4 mt-5">
        <button data-testid="end-round-btn" onClick={endRound} className="w-full h-14 rounded-2xl bg-[#0F0F10] text-[#D4AF37] font-extrabold tracking-widest border border-[#D4AF37]">END ROUND</button>
      </div>
    </div>
  );
}
