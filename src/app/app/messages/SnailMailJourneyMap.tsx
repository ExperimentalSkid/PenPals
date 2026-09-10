"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import countries from "world-countries";

type Country = (typeof countries)[number];

const COUNTRY_BY_NAME = new Map<string, Country>();
for (const country of countries) {
  COUNTRY_BY_NAME.set(country.name.common.toLowerCase(), country);
  COUNTRY_BY_NAME.set(country.name.official.toLowerCase(), country);
  for (const alt of country.altSpellings ?? []) COUNTRY_BY_NAME.set(alt.toLowerCase(), country);
}

function findCountry(value: string | null | undefined) {
  const key = value?.trim().toLowerCase();
  if (!key) return null;
  const exact = COUNTRY_BY_NAME.get(key);
  if (exact) return exact;
  return countries.find((country) => key.includes(country.name.common.toLowerCase())) ?? null;
}

function routePoints(from: [number, number], to: [number, number]) {
  const points: [number, number][] = [];
  const lonDeltaRaw = to[1] - from[1];
  const lonDelta = lonDeltaRaw > 180 ? lonDeltaRaw - 360 : lonDeltaRaw < -180 ? lonDeltaRaw + 360 : lonDeltaRaw;
  const bend = Math.min(22, Math.max(6, Math.abs(lonDelta) * 0.12));
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const lat = from[0] + (to[0] - from[0]) * t + Math.sin(Math.PI * t) * bend;
    let lon = from[1] + lonDelta * t;
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    points.push([lat, lon]);
  }
  return points;
}

export default function SnailMailJourneyMap({ origin, destination, progress, compact = false }: { origin: string | null; destination: string | null; progress: number; compact?: boolean }) {
  const t = useTranslations();
  const ref = useRef<HTMLDivElement>(null);
  const safeProgress = Math.max(0, Math.min(100, progress));

  useEffect(() => {
    const originCountry = findCountry(origin);
    const destinationCountry = findCountry(destination);
    if (!ref.current || !originCountry || !destinationCountry) return;
    let disposed = false;
    let map: import("leaflet").Map | null = null;

    void import("leaflet").then((L) => {
      if (disposed || !ref.current) return;
      const from: [number, number] = [originCountry.latlng[0], originCountry.latlng[1]];
      const to: [number, number] = [destinationCountry.latlng[0], destinationCountry.latlng[1]];
      const points = routePoints(from, to);
      const markerPoint = points[Math.round((points.length - 1) * safeProgress / 100)];

      map = L.map(ref.current, {
        attributionControl: true,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tapHold: false,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 6,
      }).addTo(map);
      L.polyline(points, { color: "#073A73", weight: 2.5, dashArray: "7 7", opacity: 0.8 }).addTo(map);
      L.circleMarker(from, { radius: 4, color: "#073A73", fillColor: "#F8F5EE", fillOpacity: 1, weight: 2 }).addTo(map);
      L.circleMarker(to, { radius: 4, color: "#073A73", fillColor: "#F8F5EE", fillOpacity: 1, weight: 2 }).addTo(map);
      const envelope = L.divIcon({ className: "snail-mail-map-envelope", html: "✉", iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker(markerPoint, { icon: envelope, interactive: false }).addTo(map);
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: compact ? [20, 20] : [28, 28], maxZoom: compact ? 3 : 4 });
    });

    return () => { disposed = true; map?.remove(); };
  }, [origin, destination, safeProgress, compact]);

  const canMap = Boolean(findCountry(origin) && findCountry(destination));
  if (!canMap) return null;

  return <div className="mt-3 overflow-hidden rounded-lg border border-[#d8d3c7] bg-[#eef3f7]">
    <div className="flex items-center justify-between gap-3 bg-[#fbfaf6]/95 px-3 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-black/50">
      <span className="truncate">{origin}</span><span className="shrink-0">{Math.round(safeProgress)}%</span><span className="truncate text-right">{destination}</span>
    </div>
    <div ref={ref} className={compact ? "h-36 w-full pointer-events-none" : "h-52 w-full pointer-events-none"} role="img" aria-label={t("app.snail.journeyMapLabel", { origin: origin ?? "", destination: destination ?? "", percent: Math.round(safeProgress) })} />
  </div>;
}
