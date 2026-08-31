import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, cachedGet, getActiveRound, setActiveRound } from "../lib/api";
import { ArrowLeft } from "@phosphor-icons/react";

export default function StartRound() {
  const nav = useNavigate();
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [holeCount, setHoleCount] = useState(18);
  const [player, setPlayer] = useState("Golfer");
  const existing = getActiveRound();

  useEffect(() => {
    cachedGet("/courses", "courses").then((cs) => { setCourses(cs); if (cs[0]) setCourseId(cs[0].id); }).catch(() => {});
  }, []);

  const start = async () => {
    if (!courseId) { toast.error("Select a course"); return; }
    const r = await api.post("/rounds", { courseId, holeCount, player });
    setActiveRound({ id: r.data.id, courseId, currentHole: 1 });
    localStorage.setItem("sg_quick_course", courseId);
    toast.success("Round started — good luck!");
    nav("/play");
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="start-round-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5 flex items-center gap-3">
        <button data-testid="start-back-btn" onClick={() => nav("/")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div>
          <p className="overline-label text-[#D4AF37]">NEW ROUND</p>
          <h1 className="font-head text-2xl font-extrabold">Start Round</h1>
        </div>
      </div>

      {existing && (
        <div className="mx-4 mt-4 bg-[#D4AF37]/10 border border-[#D4AF37] rounded-2xl p-4" data-testid="resume-round-card">
          <p className="text-sm font-bold">You have an unfinished round.</p>
          <div className="flex gap-2 mt-3">
            <button data-testid="resume-round-btn" onClick={() => nav("/play")} className="flex-1 h-12 rounded-xl bg-[#0F0F10] text-[#D4AF37] font-extrabold text-xs tracking-widest">RESUME ROUND</button>
            <button data-testid="abandon-round-btn" onClick={() => { setActiveRound(null); window.location.reload(); }} className="h-12 px-4 rounded-xl bg-zinc-100 font-bold text-xs">Discard</button>
          </div>
        </div>
      )}

      <div className="px-4 mt-5 space-y-4">
        <div>
          <p className="overline-label text-zinc-400 mb-2">GOLF COURSE</p>
          <div className="space-y-2">
            {courses.map((c) => (
              <button key={c.id} data-testid={`start-course-${c.id}`} onClick={() => setCourseId(c.id)}
                className={`w-full text-left px-4 py-3.5 rounded-2xl border ${courseId === c.id ? "border-[#14532D] bg-[#14532D]/5" : "border-zinc-200 bg-white"}`}>
                <p className="font-extrabold text-sm">{c.name}</p>
                <p className="text-[10px] text-zinc-400 font-bold">{c.location} · {c.holeCount} holes {c.isDemo && "· DEMO DATA"}</p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="overline-label text-zinc-400 mb-2">HOLES</p>
          <div className="flex gap-2">
            {[9, 18].map((n) => (
              <button key={n} data-testid={`start-holes-${n}`} onClick={() => setHoleCount(n)}
                className={`flex-1 h-14 rounded-2xl font-extrabold ${holeCount === n ? "bg-[#14532D] text-white" : "bg-white border border-zinc-200"}`}>{n} HOLES</button>
            ))}
          </div>
        </div>
        <div>
          <p className="overline-label text-zinc-400 mb-2">PLAYER</p>
          <input data-testid="start-player-input" value={player} onChange={(e) => setPlayer(e.target.value)}
            className="w-full h-14 rounded-2xl border border-zinc-200 px-4 font-bold bg-white" />
        </div>
        <button data-testid="start-round-btn" onClick={start} className="w-full h-16 rounded-2xl bg-[#14532D] text-white font-head font-extrabold tracking-[0.12em] text-lg">START ROUND</button>
      </div>
    </div>
  );
}
