"use client";

import { useMemo, useState } from "react";
import { Compass, MapPin, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SAMPLE_PLACES } from "@/lib/geography-lab/sample-places";
import { parseCoordinates } from "@/lib/geography-lab/coordinates";
import { coordinateToGrid, interpretCoordinates } from "@/lib/geography-lab/latitude-longitude";
import type { LatLng } from "@/lib/geography-lab/coordinates";

const INITIAL: LatLng = { lat: 28.6139, lng: 77.209 };

export function LatitudeLongitudeExplorer() {
  const [latText, setLatText] = useState(String(INITIAL.lat));
  const [lngText, setLngText] = useState(String(INITIAL.lng));
  const [point, setPoint] = useState<LatLng>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const interpretation = useMemo(() => interpretCoordinates(point), [point]);
  const marker = coordinateToGrid(point);

  function updatePoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseCoordinates(latText, lngText);
    if (!parsed.ok) { setError(parsed.error); return; }
    setPoint(parsed.value);
    setError(null);
    setCopyState("idle");
  }

  function choosePlace(id: string) {
    const place = SAMPLE_PLACES.find((item) => item.id === id);
    if (!place) return;
    setLatText(String(place.lat));
    setLngText(String(place.lng));
    setPoint({ lat: place.lat, lng: place.lng });
    setError(null);
    setCopyState("idle");
  }

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(`${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  function reset() {
    setLatText(String(INITIAL.lat));
    setLngText(String(INITIAL.lng));
    setPoint(INITIAL);
    setError(null);
    setCopyState("idle");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold"><Compass className="h-5 w-5 text-brand-700" aria-hidden /> Coordinate grid</h2>
              <p className="mt-1 text-sm text-forest-600">This simplified equirectangular diagram connects latitude and longitude to a position on the world grid.</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-sage-200 bg-sky-50 p-2">
              <svg viewBox="0 0 360 200" role="img" aria-label={`Selected point at latitude ${point.lat.toFixed(4)}, longitude ${point.lng.toFixed(4)}`} className="w-full">
                <rect x="20" y="20" width="320" height="160" rx="7" fill="#e0f2fe" stroke="#94a3b8" />
                {[-120, -60, 0, 60, 120].map((lng) => {
                  const x = 20 + ((lng + 180) / 360) * 320;
                  return <g key={`lng-${lng}`}><line x1={x} y1="20" x2={x} y2="180" stroke={lng === 0 ? "#0f766e" : "#94a3b8"} strokeWidth={lng === 0 ? 1.8 : 0.7} strokeDasharray={lng === 0 ? undefined : "3 4"} /><text x={x} y="13" fontSize="8" textAnchor="middle" fill="#334155">{lng === 0 ? "0°" : `${Math.abs(lng)}°${lng < 0 ? "W" : "E"}`}</text></g>;
                })}
                {[-60, -30, 0, 30, 60].map((lat) => {
                  const y = 20 + ((90 - lat) / 180) * 160;
                  return <g key={`lat-${lat}`}><line x1="20" y1={y} x2="340" y2={y} stroke={lat === 0 ? "#0f766e" : "#94a3b8"} strokeWidth={lat === 0 ? 1.8 : 0.7} strokeDasharray={lat === 0 ? undefined : "3 4"} /><text x="15" y={y + 3} fontSize="8" textAnchor="end" fill="#334155">{lat === 0 ? "0°" : `${Math.abs(lat)}°${lat < 0 ? "S" : "N"}`}</text></g>;
                })}
                <circle cx={marker.x} cy={marker.y} r="8" fill="#f97316" stroke="#7c2d12" strokeWidth="2" />
                <circle cx={marker.x} cy={marker.y} r="2" fill="#fff7ed" />
              </svg>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-sage-50 p-3"><p className="text-xs font-semibold text-forest-600">Selected coordinates</p><p className="mt-1 text-lg font-bold text-forest-950">{interpretation.coordinateLabel}</p><p className="text-xs text-forest-600">Decimal: {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</p></div>
              <div className="rounded-xl bg-sage-50 p-3"><p className="text-xs font-semibold text-forest-600">Position on Earth</p><p className="mt-1 font-bold text-forest-950">{interpretation.latitudeHemisphere} · {interpretation.longitudeHemisphere}</p><p className="text-xs text-forest-600">{interpretation.latitudeDegreesFromEquator.toFixed(4)}° from Equator; {interpretation.longitudeDegreesFromPrimeMeridian.toFixed(4)}° from Prime Meridian</p></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={copyCoordinates}>Copy decimal coordinates</Button>
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" aria-hidden/> Reset to Delhi</Button>
              <span aria-live="polite" className="self-center text-xs text-forest-600">{copyState === "copied" ? "Coordinates copied." : copyState === "failed" ? "Clipboard unavailable. Select the coordinates above to copy manually." : ""}</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <div><h2 className="text-lg font-bold">Enter a position</h2><p className="mt-1 text-sm text-forest-600">Latitude: −90° to 90°. Longitude: −180° to 180°.</p></div>
            <form onSubmit={updatePoint} noValidate className="space-y-3">
              <label className="block text-sm font-medium">Latitude (decimal degrees)<Input className="mt-1" inputMode="decimal" value={latText} onChange={(e) => setLatText(e.target.value)} placeholder="28.6139" aria-invalid={!!error}/></label>
              <label className="block text-sm font-medium">Longitude (decimal degrees)<Input className="mt-1" inputMode="decimal" value={lngText} onChange={(e) => setLngText(e.target.value)} placeholder="77.2090" aria-invalid={!!error}/></label>
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" className="w-full">Locate coordinate</Button>
            </form>
            <div>
              <label htmlFor="sample-place" className="block text-sm font-medium">Or use a sample place</label>
              <select id="sample-place" defaultValue="delhi" onChange={(e) => choosePlace(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                {SAMPLE_PLACES.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
              </select>
            </div>
            <div className="rounded-xl border border-sage-200 p-3 text-sm text-forest-700"><p className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-brand-700" aria-hidden/> Remember</p><p className="mt-1">Latitude is measured north or south of the Equator. Longitude is measured east or west of the Prime Meridian.</p></div>
          </CardBody>
        </Card>
      </div>
      <p className="text-xs text-forest-600">Learning tool only. The diagram is a simplified coordinate grid, not a navigation map.</p>
    </div>
  );
}
