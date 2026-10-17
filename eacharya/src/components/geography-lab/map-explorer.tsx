"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Copy, Crosshair, LocateFixed, MapPin, RotateCcw, Search, WifiOff, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { formatDecimal, formatDegrees, parseCoordinates, type LatLng } from "@/lib/geography-lab/coordinates";
import { SAMPLE_PLACES } from "@/lib/geography-lab/sample-places";
import type { MapCommand, MapStatus } from "./leaflet-map";

// Leaflet touches window/document on import, so it is never rendered on the server.
const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading map" className="flex h-full w-full items-center justify-center bg-sage-50">
      <Skeleton className="h-full w-full rounded-none" />
      <span className="sr-only">Loading map…</span>
    </div>
  ),
});

export function MapExplorer() {
  const [selected, setSelected] = useState<LatLng | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [showPlaces, setShowPlaces] = useState(true);
  const [status, setStatus] = useState<MapStatus>("ready");
  const [online, setOnline] = useState(true);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const commandId = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorId = useId();

  const send = useCallback((c: Omit<MapCommand, "id">) => {
    commandId.current += 1;
    setCommand({ ...c, id: commandId.current });
  }, []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const place = activePlaceId ? SAMPLE_PLACES.find((p) => p.id === activePlaceId) ?? null : null;

  const pick = useCallback((point: LatLng) => {
    setSelected(point);
    setActivePlaceId(null);
    setCopy("idle");
  }, []);

  const choosePlace = useCallback(
    (id: string) => {
      const p = SAMPLE_PLACES.find((x) => x.id === id);
      if (!p) return;
      setActivePlaceId(id);
      setSelected({ lat: p.lat, lng: p.lng });
      setCopy("idle");
      send({ type: "flyTo", target: { lat: p.lat, lng: p.lng }, zoom: 6 });
    },
    [send],
  );

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const result = parseCoordinates(latText, lngText);
    if (!result.ok) {
      setSearchError(result.error);
      return;
    }
    setSearchError(null);
    setSelected(result.value);
    setActivePlaceId(null);
    setCopy("idle");
    send({ type: "flyTo", target: result.value, zoom: 8 });
  }

  async function copyCoordinates() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(formatDecimal(selected));
      setCopy("copied");
    } catch {
      setCopy("failed"); // clipboard blocked (insecure context or permission)
    }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopy("idle"), 2500);
  }

  function clearSelection() {
    setSelected(null);
    setActivePlaceId(null);
    setCopy("idle");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        {status === "error" && (
          <Alert tone="error">
            The map could not start in this browser. You can still use the coordinate search and the sample places list.
            Try reloading the page or using a current browser.
          </Alert>
        )}
        {(!online || status === "tiles-failed") && status !== "error" && (
          <div role="status" className="flex items-start gap-2.5 rounded-xl border border-sage-300 bg-sage-50 px-3.5 py-3 text-sm text-forest-800">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>
              {online
                ? "Some map pictures could not be loaded. Check your connection or try again in a moment."
                : "You appear to be offline, so the map background cannot load."}{" "}
              Markers, coordinates and search still work.
            </p>
          </div>
        )}

        {/* isolate: Leaflet panes use high z-index values that must not overlap the site header or menus */}
        <div className="relative isolate z-0 h-[60vh] min-h-[320px] overflow-hidden rounded-card border border-sage-200 bg-sage-50 shadow-card lg:h-[640px]">
          <LeafletMap
            selected={selected}
            places={SAMPLE_PLACES}
            showPlaces={showPlaces}
            activePlaceId={activePlaceId}
            command={command}
            onPick={pick}
            onPlaceClick={choosePlace}
            onStatus={setStatus}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => send({ type: "reset" })}>
            <RotateCcw className="h-4 w-4" aria-hidden /> Reset view
          </Button>
          <Button variant="secondary" size="sm" onClick={() => send({ type: "pickCentre" })}>
            <Crosshair className="h-4 w-4" aria-hidden /> Select map centre
          </Button>
          <p className="text-xs text-forest-600">
            Map data &copy; OpenStreetMap contributors. Click or tap the map to select a point.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <LocateFixed className="h-4 w-4 text-brand-700" aria-hidden /> Go to coordinates
            </h2>
            <form onSubmit={onSearch} noValidate className="mt-3 space-y-3" aria-describedby={searchError ? errorId : undefined}>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  Latitude
                  <Input
                    value={latText}
                    onChange={(e) => setLatText(e.target.value)}
                    inputMode="decimal"
                    placeholder="28.6139"
                    autoComplete="off"
                    aria-invalid={searchError ? true : undefined}
                    className="mt-1"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Longitude
                  <Input
                    value={lngText}
                    onChange={(e) => setLngText(e.target.value)}
                    inputMode="decimal"
                    placeholder="77.2090"
                    autoComplete="off"
                    aria-invalid={searchError ? true : undefined}
                    className="mt-1"
                  />
                </label>
              </div>
              <p className="text-xs text-forest-600">Latitude -90 to 90, longitude -180 to 180, in decimal degrees (south and west are negative).</p>
              {searchError && (
                <p id={errorId} role="alert" className="text-sm font-medium text-danger-700">
                  {searchError}
                </p>
              )}
              <Button type="submit" className="w-full">
                <Search className="h-4 w-4" aria-hidden /> Go to location
              </Button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <MapPin className="h-4 w-4 text-brand-700" aria-hidden /> Selected location
            </h2>
            <div aria-live="polite" className="mt-3">
              {selected ? (
                <div className="space-y-3">
                  {place && (
                    <div>
                      <p className="font-semibold text-forest-950">{place.name}</p>
                      <p className="text-xs font-semibold text-brand-700">Sample educational data · {place.category}</p>
                      <p className="mt-1 text-sm text-forest-700">{place.description}</p>
                    </div>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-forest-600">Latitude</dt>
                    <dd className="font-mono font-semibold">{selected.lat.toFixed(4)}</dd>
                    <dt className="text-forest-600">Longitude</dt>
                    <dd className="font-mono font-semibold">{selected.lng.toFixed(4)}</dd>
                    <dt className="text-forest-600">In degrees</dt>
                    <dd className="font-semibold">{formatDegrees(selected)}</dd>
                  </dl>
                  <p className="text-xs text-forest-600">Shown to 4 decimal places (about 11 m). A map click is less exact than that.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={copyCoordinates}>
                      <Copy className="h-4 w-4" aria-hidden />
                      {copy === "copied" ? "Copied" : "Copy coordinates"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearSelection}>
                      <X className="h-4 w-4" aria-hidden /> Clear
                    </Button>
                  </div>
                  {copy === "failed" && (
                    <p role="status" className="text-xs text-danger-700">
                      Copying was blocked by the browser. Select the numbers above and copy them by hand.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-forest-600">Nothing selected. Click the map, choose a sample place, or enter coordinates.</p>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Sample places</h2>
                <p className="mt-0.5 text-xs text-forest-600">
                  A small hand-picked educational sample. Coordinates are approximate; this is not a live or authoritative dataset.
                </p>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={showPlaces}
                onChange={(e) => setShowPlaces(e.target.checked)}
                className="h-4 w-4 rounded border-sage-300 text-brand-600"
              />
              Show markers on the map
            </label>
            <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
              {SAMPLE_PLACES.map((p) => {
                const active = p.id === activePlaceId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => choosePlace(p.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full flex-col rounded-xl px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                        active ? "bg-brand-100 text-brand-900" : "hover:bg-sage-100",
                      )}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-forest-600">
                        {p.category} · {formatDegrees(p)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
