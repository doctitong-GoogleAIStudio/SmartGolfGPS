import { mToYd } from "./geo";

export type Club = { id: string; name: string; carry: number; total: number; minComfort?: number; maxComfort?: number };

export type ClubRec = {
  club: Club;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  alternative: string | null;
  reason: string;
  targetYards: number;
};

export function recommendClub(playsLikeMeters: number | null | undefined, clubs?: Club[]): ClubRec | null {
  if (playsLikeMeters == null || !clubs?.length) return null;
  const yd = mToYd(playsLikeMeters);
  const usable = clubs.filter((c) => c.carry > 0);
  if (!usable.length) return null;
  const sorted = [...usable].sort((a, b) => Math.abs(a.carry - yd) - Math.abs(b.carry - yd));
  const best = sorted[0];
  const diff = Math.abs(best.carry - yd);
  const confidence: ClubRec["confidence"] = diff <= 5 ? "HIGH" : diff <= 12 ? "MEDIUM" : "LOW";
  const longer = usable.filter((c) => c.carry > best.carry).sort((a, b) => a.carry - b.carry)[0];
  const alternative = longer ? `${longer.name} — controlled swing` : null;
  const reason = `${Math.round(yd)}-yard estimated playing distance. Your normal ${best.name} carry is approximately ${Math.round(best.carry)} yards.`;
  return { club: best, confidence, alternative, reason, targetYards: Math.round(yd) };
}
