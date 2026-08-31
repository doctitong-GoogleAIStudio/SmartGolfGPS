import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MapView } from "../components/MapView";
import { useGPS } from "../hooks/useGPS";
import { api } from "../lib/api";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react";

const MODES = [
  ["tee", "SET TEE"], ["greenFront", "SET FRONT"], ["greenCenter", "SET CENTER"], ["greenBack", "SET BACK"],
];
const HAZARD_TYPES = ["BUNKER", "WATER", "TREE", "OUT OF BOUNDS", "DOGLEG", "LAYUP", "OTHER"];

export default function CourseEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const { pos: gpsPos } = useGPS(true);
  const [course, setCourse] = useState(null);
  const [holeIdx, setHoleIdx] = useState(0);
  const [mode, setMode] = useState("tee");
  const [hazardType, setHazardType] = useState("BUNKER");

  useEffect(() => {
    api.get(`/courses/${id}`).then((r) => setCourse(r.data)).catch(() => toast.error("Course not found"));
  }, [id]);

  if (!course) return <div className="min-h-screen flex items-center justify-center text-sm font-bold text-zinc-400">Loading…</div>;

  const hole = course.holes[holeIdx];

  const patchHole = (p) => {
    const holes = course.holes.map((h, i) => (i === holeIdx ? { ...h, ...p } : h));
    setCourse({ ...course, holes });
  };

  const onMapClick = (p) => {
    const pt = { lat: p.lat, lng: p.lng };
    if (mode === "hazard") {
      const hz = { id: crypto.randomUUID(), name: `${hazardType.charAt(0) + hazardType.slice(1).toLowerCase()} ${hole.hazards.length + 1}`, type: hazardType, lat: pt.lat, lng: pt.lng, carryLat: null, carryLng: null };
      patchHole({ hazards: [...hole.hazards, hz] });
      toast.success(`${hazardType} added`);
    } else if (p.hazard && mode === "delete") {
      patchHole({ hazards: hole.hazards.filter((h) => h.id !== p.hazard.id) });
      toast.success("Hazard deleted");
    } else if (mode === "delete") {
      toast.info("Tap a hazard marker to delete it");
    } else {
      patchHole({ [mode]: pt });
      toast.success(`${MODES.find((m) => m[0] === mode)?.[1] || mode} placed`);
    }
  };

  const save = async () => {
    try {
      await api.put(`/courses/${id}`, course);
      toast.success("Course saved");
    } catch { toast.error("Save failed"); }
  };

  const center = hole.tee || hole.greenCenter || gpsPos || { lat: course.latitude, lng: course.longitude };

  return (
    <div className="fixed inset-0 bg-[#0F0F10]" data-testid="course-editor-screen">
      <div className="absolute inset-0 bottom-[190px]">
        <MapView center={center} zoom={17} mapType="satellite" onMapClick={onMapClick}
          tee={hole.tee} greens={hole} hazards={hole.hazards} gpsPos={gpsPos} recenterTrigger={holeIdx} />
      </div>
      <div className="absolute top-0 left-0 right-0 z-[1100] flex items-center gap-2 p-3">
        <button data-testid="editor-back-btn" onClick={() => nav("/courses")} className="h-11 w-11 rounded-xl bg-white shadow-lg flex items-center justify-center"><ArrowLeft size={20} weight="bold" /></button>
        <div className="bg-white rounded-xl shadow-lg h-11 px-3 flex items-center">
          <p className="text-xs font-extrabold truncate max-w-[150px]">{course.name}</p>
        </div>
        <div className="ml-auto flex items-center bg-white rounded-xl shadow-lg h-11">
          <button data-testid="editor-prev-hole" onClick={() => setHoleIdx(Math.max(0, holeIdx - 1))} className="px-2 h-full"><CaretLeft size={16} weight="bold" /></button>
          <p className="text-xs font-extrabold px-1">HOLE {hole.holeNumber}</p>
          <button data-testid="editor-next-hole" onClick={() => setHoleIdx(Math.min(course.holes.length - 1, holeIdx + 1))} className="px-2 h-full"><CaretRight size={16} weight="bold" /></button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-[1100] bg-white rounded-t-3xl border-t-2 border-[#D4AF37] p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <p className="overline-label text-zinc-400">PAR</p>
            <select data-testid="editor-par-select" value={hole.par} onChange={(e) => patchHole({ par: Number(e.target.value) })} className="h-10 rounded-lg border border-zinc-300 px-2 font-extrabold">
              {[3, 4, 5, 6].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="overline-label text-zinc-400">HCP</p>
            <input data-testid="editor-hcp-input" type="number" value={hole.handicap || ""} onChange={(e) => patchHole({ handicap: Number(e.target.value) || null })}
              className="h-10 w-14 rounded-lg border border-zinc-300 px-2 font-extrabold" />
          </div>
          <p className="ml-auto text-[10px] font-bold text-zinc-400 text-right">Tap map to place<br />selected marker</p>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MODES.map(([k, l]) => (
            <button key={k} data-testid={`editor-mode-${k}`} onClick={() => setMode(k)}
              className={`shrink-0 h-11 px-3 rounded-xl text-[10px] font-extrabold tracking-wider ${mode === k ? "bg-[#14532D] text-white" : "bg-zinc-100 text-zinc-600"} ${hole[k] ? "ring-2 ring-[#22C55E]/50" : ""}`}>
              {l} {hole[k] ? "✓" : ""}
            </button>
          ))}
          <button data-testid="editor-mode-hazard" onClick={() => setMode("hazard")}
            className={`shrink-0 h-11 px-3 rounded-xl text-[10px] font-extrabold tracking-wider ${mode === "hazard" ? "bg-[#D4AF37] text-[#0F0F10]" : "bg-zinc-100 text-zinc-600"}`}>ADD HAZARD</button>
          <button data-testid="editor-mode-delete" onClick={() => setMode("delete")}
            className={`shrink-0 h-11 px-3 rounded-xl text-[10px] font-extrabold tracking-wider ${mode === "delete" ? "bg-red-500 text-white" : "bg-zinc-100 text-zinc-600"}`}>DELETE MARKER</button>
        </div>
        {mode === "hazard" && (
          <div className="flex gap-1.5 overflow-x-auto">
            {HAZARD_TYPES.map((t) => (
              <button key={t} data-testid={`editor-hazard-type-${t.replace(/\s/g, "-").toLowerCase()}`} onClick={() => setHazardType(t)}
                className={`shrink-0 h-9 px-3 rounded-lg text-[10px] font-extrabold ${hazardType === t ? "bg-[#0F0F10] text-white" : "bg-zinc-100 text-zinc-500"}`}>{t}</button>
            ))}
          </div>
        )}
        <button data-testid="editor-save-btn" onClick={save} className="w-full h-14 rounded-2xl bg-[#14532D] text-white font-extrabold tracking-widest">SAVE HOLE / COURSE</button>
      </div>
    </div>
  );
}
