// Builds public/data/world-countries-110m.geojson from Natural Earth's 1:110m
// Admin 0 countries (public domain, https://www.naturalearthdata.com/).
//
// Usage: node scripts/build-boundaries.mjs <path-to-ne_110m_admin_0_countries.geojson>
//
// Boundaries are NOT edited. The script only (1) keeps the properties the
// Thematic Map Studio needs, (2) rounds coordinates to 3 decimals (~110 m,
// far finer than the 1:110m source), and (3) derives one symbol anchor point per
// country from its own geometry (centroid of its largest polygon).
import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) throw new Error("Pass the path to ne_110m_admin_0_countries.geojson");
const input = JSON.parse(readFileSync(src, "utf8"));
const round = (n) => Math.round(n * 1000) / 1000;
const valid = (s, re) => (typeof s === "string" && re.test(s) ? s : null);

function roundCoords(c) {
  return typeof c[0] === "number" ? [round(c[0]), round(c[1])] : c.map(roundCoords);
}

function ringArea2(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a; // twice the signed area
}
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; cx += (ring[j][0] + ring[i][0]) * f; cy += (ring[j][1] + ring[i][1]) * f;
  }
  return a === 0 ? ring[0] : [cx / (3 * a), cy / (3 * a)];
}
function anchor(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let best = null;
  for (const p of polys) {
    const area = Math.abs(ringArea2(p[0]));
    if (!best || area > best.area) best = { area, ring: p[0] };
  }
  const [lng, lat] = ringCentroid(best.ring);
  return [round(lat), round(lng)];
}

const features = input.features.map((f) => {
  const p = f.properties;
  const iso3 = valid(p.ISO_A3_EH, /^[A-Z]{3}$/) ?? valid(p.ADM0_A3, /^[A-Z]{3}$/);
  const iso2 = valid(p.ISO_A2_EH, /^[A-Z]{2}$/);
  const [alat, alng] = anchor(f.geometry);
  return {
    type: "Feature",
    properties: {
      name: p.NAME, nameLong: p.NAME_LONG, admin: p.ADMIN, formal: p.FORMAL_EN ?? null, brk: p.BRK_NAME ?? null,
      iso3, iso2, continent: p.CONTINENT, pop: p.POP_EST, popYear: p.POP_YEAR, alat, alng,
    },
    geometry: { type: f.geometry.type, coordinates: roundCoords(f.geometry.coordinates) },
  };
});

const out = { type: "FeatureCollection", features };
writeFileSync("public/data/world-countries-110m.geojson", JSON.stringify(out));
console.log(features.length, "features");
console.log("missing iso3:", features.filter((f) => !f.properties.iso3).map((f) => f.properties.name));
console.log("missing iso2:", features.filter((f) => !f.properties.iso2).map((f) => f.properties.name));
