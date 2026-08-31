import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TILES = {
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "Esri" },
  map: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "OSM" },
};

const div = (html, size, anchor) => L.divIcon({ html, className: "", iconSize: size, iconAnchor: anchor });

const ballIcon = div('<div class="mk-ball mk-upright"></div>', [18, 18], [9, 9]);
const gpsIcon = (heading) => L.divIcon({
  html: `<div class="mk-gps-wrap">${heading != null ? `<svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;inset:0;transform:rotate(${heading}deg)"><path d="M22 3 L30 17 L14 17 Z" fill="rgba(14,165,233,0.95)" stroke="white" stroke-width="1.5"/></svg>` : ""}<div class="mk-gps"></div></div>`,
  className: "gps-marker-anim", iconSize: [44, 44], iconAnchor: [22, 22],
});
const flagIcon = div('<div class="mk-flag"><svg width="30" height="34" viewBox="0 0 30 34"><line x1="6" y1="2" x2="6" y2="32" stroke="#fff" stroke-width="2.5"/><path d="M6 3 L26 8 L6 14 Z" fill="#EF4444"/><circle cx="6" cy="32" r="3" fill="#fff"/></svg></div>', [30, 34], [6, 32]);
const teeIcon = div('<div class="mk-tee">T</div>', [22, 22], [11, 11]);
const greenIcon = (label) => div(`<div class="mk-green">${label}</div>`, [20, 20], [10, 10]);
const hazardIcon = (type) => {
  const colors = { BUNKER: "#D4AF37", WATER: "#0EA5E9", TREE: "#22C55E", "OUT OF BOUNDS": "#EF4444", DOGLEG: "#fff", LAYUP: "#fff", OTHER: "#fff" };
  const letter = type === "WATER" ? "W" : type === "BUNKER" ? "B" : type[0];
  return div(`<div class="mk-hazard" style="background:${colors[type] || "#fff"}">${letter}</div>`, [22, 22], [11, 11]);
};

function ClickHandler({ onMapClick, onUserPan }) {
  useMapEvents({
    click(e) { onMapClick && onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }); },
    dragstart() { onUserPan && onUserPan(); },
  });
  return null;
}

function FollowCam({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.9, easeLinearity: 0.4 });
  }, [pos, map]);
  return null;
}

function Recenter({ center, trigger }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView([center.lat, center.lng], map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  return null;
}

export const MapView = ({
  center, zoom = 17, mapType = "satellite", onMapClick,
  ball, gpsPos, target, onTargetDrag, tee, greens, hazards = [],
  distLabel, recenterTrigger, extraMarkers = [],
  rotation = 0, followPos = null, onUserPan, gpsHeading = null, gpsPath = [], shotLines = [],
}) => {
  const midpoint = useMemo(() => {
    if (!ball || !target) return null;
    return { lat: (ball.lat + target.lat) / 2, lng: (ball.lng + target.lng) / 2 };
  }, [ball, target]);

  const tile = TILES[mapType === "map" ? "map" : "satellite"];

  return (
    <div className="absolute overflow-hidden" style={{ inset: 0 }}>
      <div
        className="absolute"
        style={{
          inset: "-24%",
          transform: `rotate(${-rotation}deg)`,
          transition: "transform 0.6s ease",
          "--map-rot": `${rotation}deg`,
        }}
      >
        <MapContainer
          center={[center.lat, center.lng]} zoom={zoom} zoomControl={false}
          style={{ width: "100%", height: "100%", background: "#0a1f12" }}
          attributionControl={false}
        >
      <TileLayer url={tile.url} maxZoom={19} />
      {mapType === "hybrid" && (
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
      )}
      <ClickHandler onMapClick={onMapClick} onUserPan={onUserPan} />
      <FollowCam pos={followPos} />
      <Recenter center={center} trigger={recenterTrigger} />
      {gpsPath.length > 1 && (
        <Polyline positions={gpsPath.map((p) => [p.lat, p.lng])} pathOptions={{ color: "#0EA5E9", weight: 3, opacity: 0.55 }} />
      )}
      {shotLines.map((s, i) => (
        <Polyline key={`sl-${i}`} positions={[[s.start.lat, s.start.lng], [s.end.lat, s.end.lng]]}
          pathOptions={{ color: "#D4AF37", weight: 3, opacity: 0.9 }} />
      ))}
      {shotLines.map((s, i) => s.label ? (
        <Marker key={`slm-${i}`} interactive={false}
          position={[(s.start.lat + s.end.lat) / 2, (s.start.lng + s.end.lng) / 2]}
          icon={div(`<div class="mk-distlabel" style="background:#D4AF37;color:#0F0F10;border-color:#0F0F10">${s.label}</div>`, [90, 24], [45, 12])} />
      ) : null)}
      {gpsPos && <Marker position={[gpsPos.lat, gpsPos.lng]} icon={gpsIcon(gpsHeading)} zIndexOffset={500} />}
      {ball && <Marker position={[ball.lat, ball.lng]} icon={ballIcon} />}
      {tee && <Marker position={[tee.lat, tee.lng]} icon={teeIcon} />}
      {greens?.greenFront && <Marker position={[greens.greenFront.lat, greens.greenFront.lng]} icon={greenIcon("F")} />}
      {greens?.greenCenter && <Marker position={[greens.greenCenter.lat, greens.greenCenter.lng]} icon={greenIcon("C")} />}
      {greens?.greenBack && <Marker position={[greens.greenBack.lat, greens.greenBack.lng]} icon={greenIcon("B")} />}
      {hazards.map((h) => (
        <Marker key={h.id} position={[h.lat, h.lng]} icon={hazardIcon(h.type)}
          eventHandlers={{ click: () => onMapClick && onMapClick({ lat: h.lat, lng: h.lng, hazard: h }) }} />
      ))}
      {extraMarkers}
      {target && (
        <Marker
          position={[target.lat, target.lng]} icon={flagIcon} draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = e.target.getLatLng();
              onTargetDrag && onTargetDrag({ lat: ll.lat, lng: ll.lng });
            },
          }}
        />
      )}
      {ball && target && (
        <>
          <Polyline positions={[[ball.lat, ball.lng], [target.lat, target.lng]]}
            pathOptions={{ color: "#ffffff", weight: 2.5, dashArray: "6 8", opacity: 0.9 }} />
          {distLabel && midpoint && (
            <Marker position={[midpoint.lat, midpoint.lng]} interactive={false}
              icon={div(`<div class="mk-distlabel">${distLabel}</div>`, [70, 24], [35, 12])} />
          )}
        </>
      )}
    </MapContainer>
      </div>
    </div>
  );
};
