import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { fmtDist, unitLabel } from "../lib/geo";
import { MapView } from "../components/MapView";
import { ArrowLeft, Trash, Play, Stop } from "@phosphor-icons/react";
import { toast } from "sonner";

export default function RoundDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useSettings();
  const [round, setRound] = useState(null);
  const [shots, setShots] = useState([]);
  const [replayIdx, setReplayIdx] = useState(null);
  const replayTimer = useRef(null);

  useEffect(() => {
    api.get(`/rounds/${id}`).then((r) => setRound(r.data)).catch(() => {});
    api.get(`/shots?roundId=${id}`).then((r) => setShots(r.data)).catch(() => {});
    return () => clearInterval(replayTimer.current);
  }, [id]);

  if (!round) return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-zinc-400">Loading…</div>;

  const played = round.scores.filter((s) => s.score);
  const total = played.reduce((a, s) => a + s.score, 0);
  const par = played.reduce((a, s) => a + s.par, 0);
  const putts = played.reduce((a, s) => a + (s.putts || 0), 0);
  const fw = played.filter((s) => s.fairway !== null && s.fairway !== undefined);
  const gir = played.filter((s) => s.gir !== null && s.gir !== undefined);

  const delRound = async () => {
    if (!window.confirm("Delete this round and its shots?")) return;
    await api.delete(`/rounds/${id}`);
    toast.success("Round deleted");
    nav("/history");
  };

  const path = round.gpsPath || [];
  const shotLines = shots.map((s) => ({
    start: { lat: s.startLat, lng: s.startLng }, end: { lat: s.endLat, lng: s.endLng },
    label: `${s.club} · ${fmtDist(s.distanceMeters, settings.distanceUnit)} ${unitLabel(settings.distanceUnit).toLowerCase()}`,
  }));
  const hasMap = path.length > 1 || shotLines.length > 0;
  const mapCenter = path[0] || shotLines[0]?.start || null;
  const replaying = replayIdx != null;

  const toggleReplay = () => {
    if (replaying) {
      clearInterval(replayTimer.current);
      setReplayIdx(null);
      return;
    }
    let i = 0;
    setReplayIdx(0);
    replayTimer.current = setInterval(() => {
      i += 1;
      if (i >= path.length) { clearInterval(replayTimer.current); setReplayIdx(null); }
      else setReplayIdx(i);
    }, 80);
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="round-detail-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5 flex items-center gap-3">
        <button data-testid="detail-back-btn" onClick={() => nav("/history")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><ArrowLeft size={18} /></button>
        <div className="flex-1">
          <p className="overline-label text-[#D4AF37]">{new Date(round.startedAt).toLocaleDateString()}</p>
          <h1 className="font-head text-xl font-extrabold">{round.courseName}</h1>
        </div>
        <button data-testid="delete-round-btn" onClick={delRound} className="h-10 w-10 rounded-xl bg-white/10 text-red-400 flex items-center justify-center"><Trash size={18} /></button>
      </div>

      <div className="px-4 mt-4 grid grid-cols-4 gap-2">
        {[["SCORE", total || "-"], ["TO PAR", played.length ? (total - par > 0 ? "+" : "") + (total - par) : "-"], ["PUTTS", putts || "-"], ["FW / GIR", `${fw.filter((s) => s.fairway).length}/${fw.length || 0} · ${gir.filter((s) => s.gir).length}/${gir.length || 0}`]].map(([l, v]) => (
          <div key={l} className="bg-white border border-zinc-200 rounded-xl py-2.5 text-center">
            <p className="text-[8px] font-extrabold tracking-widest text-zinc-400">{l}</p>
            <p className="font-num text-lg">{v}</p>
          </div>
        ))}
      </div>

      {hasMap && mapCenter && (
        <div className="mx-4 mt-4 bg-white border border-zinc-200 rounded-2xl overflow-hidden" data-testid="path-replay-card">
          <div className="relative h-72">
            <MapView center={mapCenter} zoom={16}
              gpsPath={path} shotLines={shotLines}
              gpsPos={replaying ? path[replayIdx] : null}
              followPos={replaying ? path[replayIdx] : null} />
          </div>
          <div className="p-3 flex items-center justify-between">
            <div>
              <p className="overline-label text-zinc-400">ROUND MAP</p>
              <p className="text-[11px] font-bold text-zinc-500">{path.length > 1 ? `${path.length} GPS points` : ""}{path.length > 1 && shotLines.length ? " · " : ""}{shotLines.length ? `${shotLines.length} shots` : ""}</p>
            </div>
            {path.length > 1 && (
              <button data-testid="replay-btn" onClick={toggleReplay}
                className={`h-11 px-4 rounded-xl font-extrabold text-xs tracking-widest flex items-center gap-1.5 ${replaying ? "bg-red-500 text-white" : "bg-[#14532D] text-white"}`}>
                {replaying ? <><Stop size={16} weight="fill" /> STOP</> : <><Play size={16} weight="fill" /> REPLAY ROUND</>}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mx-4 mt-4 bg-white rounded-2xl border border-zinc-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="bg-[#0F0F10] text-white"><th className="py-2 px-2 text-left">HOLE</th><th>PAR</th><th>SCORE</th><th>PUTTS</th><th>FW</th><th>GIR</th><th>PEN</th></tr></thead>
          <tbody>
            {round.scores.map((x, i) => (
              <tr key={i} className={`text-center ${i % 2 ? "bg-zinc-50" : ""}`}>
                <td className="py-1.5 px-2 text-left font-extrabold">{x.hole}</td>
                <td>{x.par}</td>
                <td className={`font-extrabold ${x.score ? (x.score < x.par ? "text-[#22C55E]" : x.score > x.par ? "text-red-500" : "") : "text-zinc-300"}`}>{x.score || "-"}</td>
                <td>{x.putts ?? "-"}</td>
                <td>{x.fairway === true ? "✓" : x.fairway === false ? "✕" : "-"}</td>
                <td>{x.gir === true ? "✓" : x.gir === false ? "✕" : "-"}</td>
                <td>{x.penalty || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shots.length > 0 && (
        <div className="px-4 mt-5">
          <p className="overline-label text-zinc-400 mb-2">SHOTS ({shots.length})</p>
          <div className="space-y-1.5">
            {shots.map((s) => (
              <div key={s.id} className="bg-white border border-zinc-200 rounded-xl px-4 py-2.5 flex items-center justify-between" data-testid={`shot-row-${s.id}`}>
                <p className="text-xs font-extrabold">{s.club} {s.holeNumber && <span className="text-zinc-400">· Hole {s.holeNumber}</span>}</p>
                <p className="font-num text-lg">{fmtDist(s.distanceMeters, settings.distanceUnit)} <span className="text-[10px]">{unitLabel(settings.distanceUnit)}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
