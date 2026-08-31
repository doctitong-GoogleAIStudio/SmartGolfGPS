import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, cachedGet } from "../lib/api";
import { House, Plus, PencilSimple, Trash, Crosshair } from "@phosphor-icons/react";

export default function Courses() {
  const nav = useNavigate();
  const [courses, setCourses] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", holeCount: 18 });

  const load = () => cachedGet("/courses", "courses").then(setCourses).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { toast.error("Enter a course name"); return; }
    let lat = 7.052, lng = 125.517;
    try {
      const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 }));
      lat = p.coords.latitude; lng = p.coords.longitude;
    } catch {}
    const r = await api.post("/courses", { ...form, latitude: lat, longitude: lng, holes: [] });
    setShowNew(false);
    toast.success("Course created — now set tees & greens on the map");
    nav(`/courses/${r.data.id}/edit`);
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this course?")) return;
    await api.delete(`/courses/${id}`);
    load();
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="courses-screen">
      <div className="bg-[#0F0F10] text-white px-5 pt-6 pb-5 flex items-center justify-between">
        <div>
          <p className="overline-label text-[#D4AF37]">COURSES</p>
          <h1 className="font-head text-2xl font-extrabold">Golf Courses</h1>
        </div>
        <button data-testid="courses-home-btn" onClick={() => nav("/")} className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center"><House size={18} /></button>
      </div>
      <div className="px-4 mt-4 space-y-3">
        <button data-testid="new-course-btn" onClick={() => setShowNew(true)} className="w-full h-14 rounded-2xl bg-[#14532D] text-white font-extrabold tracking-widest flex items-center justify-center gap-2">
          <Plus size={18} weight="bold" /> NEW COURSE
        </button>
        {courses.map((c) => (
          <div key={c.id} className="bg-white border border-zinc-200 rounded-2xl px-4 py-4" data-testid={`course-card-${c.id}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-head font-extrabold">{c.name}</p>
                <p className="text-[11px] text-zinc-400 font-bold">{c.location} · {c.holeCount} holes {c.isDemo && <span className="text-[#D4AF37]">· DEMO DATA</span>}</p>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button data-testid={`course-play-${c.id}`} onClick={() => { localStorage.setItem("sg_quick_course", c.id); nav("/play"); }}
                className="flex-1 h-11 rounded-xl bg-[#14532D] text-white text-xs font-extrabold flex items-center justify-center gap-1.5"><Crosshair size={16} /> RANGEFINDER</button>
              <button data-testid={`course-edit-${c.id}`} onClick={() => nav(`/courses/${c.id}/edit`)}
                className="h-11 px-4 rounded-xl bg-zinc-100 text-xs font-extrabold flex items-center justify-center gap-1.5"><PencilSimple size={16} /> EDIT</button>
              <button data-testid={`course-delete-${c.id}`} onClick={() => remove(c.id)} className="h-11 w-11 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"><Trash size={16} /></button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 z-[2000] bg-black/70 flex items-end" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-t-3xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()} data-testid="new-course-dialog">
            <p className="font-head text-xl font-extrabold">New Course</p>
            <input data-testid="course-name-input" placeholder="Course name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full h-14 rounded-xl border border-zinc-300 px-4 font-bold" />
            <input data-testid="course-location-input" placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full h-14 rounded-xl border border-zinc-300 px-4 font-bold" />
            <div className="flex gap-2">
              {[9, 18].map((n) => (
                <button key={n} data-testid={`course-holes-${n}`} onClick={() => setForm({ ...form, holeCount: n })}
                  className={`flex-1 h-12 rounded-xl font-extrabold ${form.holeCount === n ? "bg-[#14532D] text-white" : "bg-zinc-100"}`}>{n} HOLES</button>
              ))}
            </div>
            <button data-testid="create-course-btn" onClick={create} className="w-full h-14 rounded-2xl bg-[#14532D] text-white font-extrabold tracking-widest">CREATE & OPEN EDITOR</button>
          </div>
        </div>
      )}
    </div>
  );
}
