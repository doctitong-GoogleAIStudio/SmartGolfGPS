import { useNavigate, useLocation } from "react-router-dom";
import { MapTrifold, ListNumbers, Sparkle, Bag, DotsThreeCircle } from "@phosphor-icons/react";

const items = [
  { key: "map", label: "MAP", path: "/play", icon: MapTrifold },
  { key: "score", label: "SCORE", path: "/play/score", icon: ListNumbers },
  { key: "caddie", label: "CADDIE", path: "/play/caddie", icon: Sparkle },
  { key: "bag", label: "BAG", path: "/bag", icon: Bag },
  { key: "more", label: "MORE", path: "/more", icon: DotsThreeCircle },
];

export const BottomNav = () => {
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[1200] bg-[#0F0F10] border-t border-white/10 flex justify-around pb-[env(safe-area-inset-bottom)]" data-testid="bottom-nav">
      {items.map((it) => {
        const active = loc.pathname === it.path;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            data-testid={`nav-${it.key}`}
            onClick={() => nav(it.path)}
            className={`flex flex-col items-center gap-0.5 py-2.5 px-3 min-w-[60px] transition-colors ${active ? "text-[#D4AF37]" : "text-white/60"}`}
          >
            <Icon size={24} weight={active ? "fill" : "regular"} />
            <span className="text-[10px] font-bold tracking-[0.15em]">{it.label}</span>
            <span className={`h-0.5 w-6 rounded-full ${active ? "bg-[#D4AF37]" : "bg-transparent"}`} />
          </button>
        );
      })}
    </nav>
  );
};
