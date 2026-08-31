import { mToYd } from "./geo";

// All inputs metric; returns adjustments in meters. Estimates only.
export function computePlaysLike({ actualMeters, elevDiffM = 0, windSpeedKmh = 0, windDir = "none", tempC = null, toggles = {}, tournamentMode = false }) {
  if (actualMeters == null) return null;
  if (tournamentMode) {
    return { actualMeters, elevationAdj: 0, windAdj: 0, tempAdj: 0, totalAdj: 0, playsLikeMeters: actualMeters, tournamentMode: true };
  }
  let elevationAdj = 0;
  if (toggles.elevationAdj !== false && elevDiffM) {
    elevationAdj = elevDiffM; // ~1m plays-like per 1m elevation change
  }
  let windAdj = 0;
  if (toggles.windAdj !== false && windSpeedKmh > 0) {
    const mph = windSpeedKmh / 1.609;
    if (windDir === "head") windAdj = actualMeters * 0.01 * mph;
    else if (windDir === "tail") windAdj = -actualMeters * 0.005 * mph;
    else if (windDir === "left" || windDir === "right") windAdj = actualMeters * 0.0015 * mph;
  }
  let tempAdj = 0;
  if (toggles.tempAdj === true && tempC != null) {
    tempAdj = ((20 - tempC) / 10) * (actualMeters * 0.01);
  }
  const totalAdj = elevationAdj + windAdj + tempAdj;
  return {
    actualMeters,
    elevationAdj,
    windAdj,
    tempAdj,
    totalAdj,
    playsLikeMeters: Math.max(0, actualMeters + totalAdj),
    tournamentMode: false,
  };
}

export function playsLikeYards(pl) {
  return pl ? Math.round(mToYd(pl.playsLikeMeters)) : null;
}
