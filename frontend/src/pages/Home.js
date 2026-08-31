import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useSettings } from "../context/SettingsContext";
import { Crosshair, Flag, Bag, ClockCounterClockwise, ChartBar, Gear, MapPin } from "@phosphor-icons/react";

const HERO = "https://images.unsplash.com/photo-1596782680712-caf5530d2b3c?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

export default function Home() {
  const nav = useNavigate();
  const { settings, update } = useSettings();
  const [showOnboard, setShowOnboard] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("sg_onboarded")) setShowOnboard(true);
  }, []);

  const finishOnboard = () => {
    localStorage.setItem("sg_onboarded", "1");
    setShowOnboard(false);
  };

  const MenuBtn = ({ label, path, icon: Icon, testId, primary }) => (
    <button
      data-testid={testId}
      onClick={() => nav(path)}
      className={`flex items-center gap-4 w-full h-16 px-6 rounded-2xl font-head font-extrabold tracking-wide text-left transition-colors ${
        primary ? "bg-[#14532D] text-white hover:bg-[#1a6b3a]" : "bg-white border border-zinc-200 text-[#0F0F10] hover:border-[#14532D]"
      }`}
    >
      <Icon size={26} weight={primary ? "fill" : "regular"} className={primary ? "text-[#D4AF37]" : "text-[#14532D]"} />
      <span className="text-base tracking-[0.08em]">{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFD] pb-10" data-testid="home-screen">
      <div className="relative h-64 overflow-hidden">
        <img src={HERO} alt="golf course" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F10] via-[#0F0F10]/50 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6">
          <p className="overline-label text-[#D4AF37]">GPS RANGEFINDER · AI CADDIE</p>
          <h1 className="font-num text-5xl text-white mt-1 uppercase">Smart Golf GPS</h1>
        </div>
      </div>

      <div className="px-6 pt-8 space-y-3 max-w-md mx-auto">
        <MenuBtn label="START ROUND" path="/start-round" icon={Flag} testId="home-start-round-btn" primary />
        <MenuBtn label="QUICK RANGEFINDER" path="/play" icon={Crosshair} testId="home-quick-rangefinder-btn" primary />
        <MenuBtn label="COURSES" path="/courses" icon={MapPin} testId="home-courses-btn" />
        <MenuBtn label="MY BAG" path="/bag" icon={Bag} testId="home-bag-btn" />
        <MenuBtn label="ROUND HISTORY" path="/history" icon={ClockCounterClockwise} testId="home-history-btn" />
        <MenuBtn label="STATISTICS" path="/stats" icon={ChartBar} testId="home-stats-btn" />
        <MenuBtn label="SETTINGS" path="/more" icon={Gear} testId="home-settings-btn" />
      </div>

      {showOnboard && (
        <div className="fixed inset-0 z-[2000] bg-[#0F0F10]/80 flex items-end sm:items-center justify-center p-4" data-testid="onboarding-overlay">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md space-y-6">
            <div>
              <p className="overline-label text-[#14532D]">WELCOME</p>
              <h2 className="font-head text-3xl font-extrabold mt-1">Smart Golf GPS</h2>
              <p className="text-sm text-zinc-500 mt-2">Stand on the course, place your ball, tap a target — get instant distances.</p>
            </div>
            <div className="space-y-3">
              <p className="overline-label text-zinc-400">STEP 1 · DISTANCE UNIT</p>
              <div className="flex gap-2">
                {["yd", "m"].map((u) => (
                  <button key={u} data-testid={`onboard-unit-${u}`} onClick={() => update({ distanceUnit: u })}
                    className={`flex-1 h-14 rounded-xl font-bold tracking-widest ${settings.distanceUnit === u ? "bg-[#14532D] text-white" : "bg-zinc-100 text-zinc-600"}`}>
                    {u === "yd" ? "YARDS" : "METERS"}
                  </button>
                ))}
              </div>
              <p className="overline-label text-zinc-400">STEP 2 · LOCATION</p>
              <button data-testid="onboard-allow-location"
                onClick={() => navigator.geolocation?.getCurrentPosition(() => {}, () => {}, { enableHighAccuracy: true })}
                className="w-full h-14 rounded-xl bg-zinc-100 font-bold tracking-widest text-zinc-700">
                ALLOW LOCATION
              </button>
            </div>
            <button data-testid="onboard-start-btn" onClick={finishOnboard}
              className="w-full h-16 rounded-2xl bg-[#14532D] text-white font-head font-extrabold tracking-[0.1em] text-lg">
              START USING RANGEFINDER
            </button>
            <button data-testid="onboard-skip-btn" onClick={finishOnboard} className="w-full text-sm text-zinc-400 font-semibold">SKIP</button>
          </div>
        </div>
      )}
    </div>
  );
}
