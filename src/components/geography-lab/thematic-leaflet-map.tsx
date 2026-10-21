"use client";

/**
 * Leaflet renderer for the Thematic Map Studio. Imports Leaflet at module top, so it must only be loaded in
 * the browser (thematic-studio.tsx uses next/dynamic with ssr:false), the same pattern as leaflet-map.tsx.
 *
 * All text shown in tooltips is set with textContent, never innerHTML, because symbol labels come from
 * uploaded CSV files.
 */
import "leaflet/dist/leaflet.css";
import * as L from "leaflet";
import { useEffect, useRef } from "react";
import type { GeoJsonObject } from "geojson";
import { BOUNDARY_ATTRIBUTION, type BoundaryFeature } from "@/lib/thematic/boundaries";
import { NO_DATA_FILL } from "@/lib/thematic/legend";

export type ThematicMapStatus = "ready" | "tiles-failed" | "error";

export interface RegionInfo { title: string; valueText: string }
export interface SymbolDatum { key: string; lat: number; lng: number; radius: number; title: string; valueText: string }

export interface ThematicCommand {
  id: number;
  type: "reset" | "focusRegion" | "focusPoint";
  index?: number;
  lat?: number;
  lng?: number;
}

interface Props {
  features: readonly BoundaryFeature[] | null;
  /** Fill colour for each feature index, or null for "no data". */
  regionColours: readonly (string | null)[];
  /** True when regions are the thematic layer (choropleth / graduated). False draws them as a plain base. */
  regionsAreThematic: boolean;
  regionInfo: readonly RegionInfo[];
  symbols: readonly SymbolDatum[];
  symbolColour: string;
  showBasemap: boolean;
  /** "r:<featureIndex>" or "p:<rowIndex>" */
  selectedKey: string | null;
  command: ThematicCommand | null;
  onSelect: (key: string | null) => void;
  onStatus: (s: ThematicMapStatus) => void;
}

const BASE_FILL = "#efece3";
const BASE_STROKE = "#b5b09c";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function tooltipEl(title: string, valueText: string): HTMLElement {
  const root = document.createElement("div");
  const t = document.createElement("strong");
  t.textContent = title;
  const v = document.createElement("div");
  v.textContent = valueText;
  root.append(t, v);
  return root;
}

export default function ThematicLeafletMap(props: Props) {
  const { features, regionColours, regionsAreThematic, symbols, symbolColour, showBasemap, selectedKey, command } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const homeRef = useRef<{ center: L.LatLngTuple; zoom: number }>({ center: [20, 10], zoom: 2 });
  const regionLayerRef = useRef<L.GeoJSON | null>(null);
  const regionLayersRef = useRef<L.Path[]>([]);
  const symbolGroupRef = useRef<L.LayerGroup | null>(null);
  const symbolMarkersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const tileRef = useRef<L.TileLayer | null>(null);
  const hoverRef = useRef<number | null>(null);
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  // Create the map once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let map: L.Map;
    try {
      const zoom = el.clientWidth < 700 ? 1 : 2;
      homeRef.current = { center: [20, 10], zoom };
      map = L.map(el, {
        center: homeRef.current.center,
        zoom,
        minZoom: 1,
        maxZoom: 8,
        maxBounds: [[-85, -200], [85, 200]],
        maxBoundsViscosity: 1,
        preferCanvas: true,
        zoomControl: true,
      });
      map.createPane("symbols").style.zIndex = "450";
      map.attributionControl.addAttribution(BOUNDARY_ATTRIBUTION);
      symbolGroupRef.current = L.layerGroup([], { pane: "symbols" }).addTo(map);
      map.on("click", () => handlers.current.onSelect(null));
      mapRef.current = map;
      handlers.current.onStatus("ready");
    } catch {
      handlers.current.onStatus("error");
      return;
    }
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      regionLayerRef.current = null;
      regionLayersRef.current = [];
      symbolGroupRef.current = null;
      symbolMarkersRef.current = new Map();
      tileRef.current = null;
    };
  }, []);

  // Optional OpenStreetMap background (off by default so no tile requests are made unless asked for).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    tileRef.current = null;
    if (!showBasemap) {
      handlers.current.onStatus("ready");
      return;
    }
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: OSM_ATTRIBUTION });
    let failures = 0;
    let warned = false;
    tiles.on("tileerror", () => {
      failures += 1;
      if (failures >= 3 && !warned) { warned = true; handlers.current.onStatus("tiles-failed"); }
    });
    tiles.on("tileload", () => {
      failures = 0;
      if (warned) { warned = false; handlers.current.onStatus("ready"); }
    });
    tiles.addTo(map);
    tiles.bringToBack();
    tileRef.current = tiles;
  }, [showBasemap]);

  // Boundary layer (rebuilt only when the geometry or interactivity changes; colours are applied separately).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !features) return;
    regionLayerRef.current?.remove();
    const layers: L.Path[] = [];
    const layer = L.geoJSON({ type: "FeatureCollection", features } as unknown as GeoJsonObject, {
      interactive: regionsAreThematic,
      bubblingMouseEvents: false,
      onEachFeature: (_f, l) => {
        const idx = layers.length;
        layers.push(l as L.Path);
        if (!regionsAreThematic) return;
        l.bindTooltip(() => {
          const info = handlers.current.regionInfo[idx];
          return tooltipEl(info?.title ?? "", info?.valueText ?? "");
        }, { sticky: true, direction: "top" });
        l.on("click", (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          handlers.current.onSelect(`r:${idx}`);
        });
        l.on("mouseover", () => { hoverRef.current = idx; applyStyles(); });
        l.on("mouseout", () => { hoverRef.current = null; applyStyles(); });
      },
    }).addTo(map);
    layer.bringToBack();
    tileRef.current?.bringToBack();
    regionLayerRef.current = layer;
    regionLayersRef.current = layers;
    applyStyles();
  }, [features, regionsAreThematic]);

  function applyStyles() {
    const h = handlers.current;
    const layers = regionLayersRef.current;
    layers.forEach((l, idx) => {
      const selected = h.selectedKey === `r:${idx}`;
      const hover = hoverRef.current === idx;
      if (h.regionsAreThematic) {
        l.setStyle({
          fillColor: h.regionColours[idx] ?? NO_DATA_FILL,
          fillOpacity: 1,
          color: selected ? "#0a1f17" : hover ? "#27443a" : "#ffffff",
          weight: selected ? 2.5 : hover ? 1.8 : 0.6,
        });
      } else {
        l.setStyle({
          fillColor: BASE_FILL, fillOpacity: h.showBasemap ? 0 : 1, color: BASE_STROKE, weight: 0.6,
        });
      }
      if ((selected || hover) && "bringToFront" in l) (l as L.Path).bringToFront();
    });
  }

  // Colours / selection changes restyle existing layers instead of rebuilding them.
  useEffect(() => {
    applyStyles();
  }, [regionColours, regionsAreThematic, showBasemap, selectedKey]);

  // Proportional symbols.
  useEffect(() => {
    const group = symbolGroupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = new Map<string, L.CircleMarker>();
    for (const s of symbols) {
      if (!(s.radius > 0)) continue;
      const m = L.circleMarker([s.lat, s.lng], {
        pane: "symbols", radius: s.radius, color: "#0a1f17", weight: 1, fillColor: symbolColour, fillOpacity: 0.65,
        bubblingMouseEvents: false,
      });
      m.bindTooltip(() => tooltipEl(s.title, s.valueText), { direction: "top", offset: [0, -Math.min(s.radius, 20)] });
      m.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        handlers.current.onSelect(s.key);
      });
      m.addTo(group);
      markers.set(s.key, m);
    }
    symbolMarkersRef.current = markers;
    for (const [key, m] of markers) {
      if (key === handlers.current.selectedKey) m.setStyle({ color: "#000000", weight: 3 });
    }
  }, [symbols, symbolColour]);

  useEffect(() => {
    for (const [key, m] of symbolMarkersRef.current) {
      if (key === selectedKey) { m.setStyle({ color: "#000000", weight: 3 }); m.bringToFront(); }
      else m.setStyle({ color: "#0a1f17", weight: 1 });
    }
  }, [selectedKey]);

  // Commands from the surrounding UI.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !command) return;
    const animate = !reducedMotion();
    if (command.type === "reset") {
      map.setView(homeRef.current.center, homeRef.current.zoom, { animate });
    } else if (command.type === "focusRegion" && command.index !== undefined) {
      const l = regionLayersRef.current[command.index] as L.Polygon | undefined;
      const b = l?.getBounds?.();
      if (b?.isValid()) map.flyToBounds(b, { maxZoom: 5, padding: [30, 30], animate, duration: animate ? 0.8 : 0 });
    } else if (command.type === "focusPoint" && command.lat !== undefined && command.lng !== undefined) {
      const z = Math.max(map.getZoom(), 4);
      if (animate) map.flyTo([command.lat, command.lng], z, { duration: 0.8 });
      else map.setView([command.lat, command.lng], z, { animate: false });
    }
  }, [command]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "#cfe3ee" }}
      role="region"
      aria-label="Thematic world map. Use the regional values table below the map to read and select values with a keyboard. With the map focused, arrow keys pan and plus or minus zoom."
    />
  );
}
