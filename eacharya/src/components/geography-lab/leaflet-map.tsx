"use client";

/**
 * Leaflet wrapper. Imports Leaflet at module top, so this file must only ever be
 * loaded in the browser: map-explorer.tsx loads it with next/dynamic({ ssr: false }).
 * Markers are vector circles, so no marker image assets are needed.
 */
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import { useEffect, useRef } from "react";
import { clampLatitude, wrapLongitude, type LatLng } from "@/lib/geography-lab/coordinates";
import type { SamplePlace } from "@/lib/geography-lab/sample-places";

export type MapStatus = "ready" | "tiles-failed" | "error";

export interface MapCommand {
  /** Increment for every command so repeating the same one still runs. */
  id: number;
  type: "reset" | "flyTo" | "pickCentre";
  target?: LatLng;
  zoom?: number;
}

interface Props {
  selected: LatLng | null;
  places: readonly SamplePlace[];
  showPlaces: boolean;
  activePlaceId: string | null;
  command: MapCommand | null;
  onPick: (point: LatLng) => void;
  onPlaceClick: (id: string) => void;
  onStatus: (status: MapStatus) => void;
}

const HOME_VIEW: { center: L.LatLngTuple; zoom: number } = { center: [20, 10], zoom: 2 };
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const TILE_ERRORS_BEFORE_WARNING = 3;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function LeafletMap(props: Props) {
  const { selected, places, showPlaces, activePlaceId, command } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const selectedLayerRef = useRef<L.CircleMarker | null>(null);
  const placesLayerRef = useRef<L.LayerGroup | null>(null);
  const handlers = useRef(props);
  // Always call the latest callbacks without rebuilding the map. Declared first so it runs first.
  useEffect(() => {
    handlers.current = props;
  });

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let map: L.Map;
    try {
      map = L.map(el, {
        center: HOME_VIEW.center,
        zoom: HOME_VIEW.zoom,
        minZoom: 2,
        worldCopyJump: true,
        zoomControl: true,
      });
      const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION });
      let failures = 0;
      let warned = false;
      tiles.on("tileerror", () => {
        failures += 1;
        if (failures >= TILE_ERRORS_BEFORE_WARNING && !warned) {
          warned = true;
          handlers.current.onStatus("tiles-failed");
        }
      });
      tiles.on("tileload", () => {
        failures = 0;
        if (warned) {
          warned = false;
          handlers.current.onStatus("ready");
        }
      });
      tiles.addTo(map);

      map.on("click", (e: L.LeafletMouseEvent) => {
        handlers.current.onPick({ lat: clampLatitude(e.latlng.lat), lng: wrapLongitude(e.latlng.lng) });
      });

      placesLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      handlers.current.onStatus("ready");
    } catch {
      handlers.current.onStatus("error");
      return;
    }

    // Keep tiles correct when the container resizes (rotation, sidebar wrap, window resize).
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      selectedLayerRef.current = null;
      placesLayerRef.current = null;
    };
  }, []);

  // Selected-point marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    selectedLayerRef.current?.remove();
    selectedLayerRef.current = null;
    if (selected) {
      selectedLayerRef.current = L.circleMarker([selected.lat, selected.lng], {
        radius: 9, color: "#9a3412", weight: 3, fillColor: "#fb923c", fillOpacity: 0.9, interactive: false,
      }).addTo(map);
    }
  }, [selected]);

  // Sample-place markers.
  useEffect(() => {
    const layer = placesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showPlaces) return;
    for (const p of places) {
      const active = p.id === activePlaceId;
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: active ? 9 : 6, color: "#14532d", weight: active ? 3 : 2,
        fillColor: active ? "#facc15" : "#22c55e", fillOpacity: 0.9,
      });
      marker.bindTooltip(p.name, { direction: "top" });
      marker.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e); // do not also drop a clicked-point marker
        handlers.current.onPlaceClick(p.id);
      });
      marker.addTo(layer);
    }
  }, [places, showPlaces, activePlaceId]);

  // Commands from the surrounding UI (reset, search, choose place, use centre).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !command) return;
    if (command.type === "reset") {
      map.setView(HOME_VIEW.center, HOME_VIEW.zoom, { animate: !reducedMotion() });
    } else if (command.type === "flyTo" && command.target) {
      const zoom = command.zoom ?? Math.max(map.getZoom(), 5);
      const to: L.LatLngTuple = [command.target.lat, command.target.lng];
      if (reducedMotion()) map.setView(to, zoom, { animate: false });
      else map.flyTo(to, zoom, { duration: 1 });
    } else if (command.type === "pickCentre") {
      const c = map.getCenter();
      handlers.current.onPick({ lat: clampLatitude(c.lat), lng: wrapLongitude(c.lng) });
    }
  }, [command]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      role="region"
      aria-label="Interactive world map. Click or tap to select a point. Focus the map and use arrow keys to pan and plus or minus to zoom."
    />
  );
}
