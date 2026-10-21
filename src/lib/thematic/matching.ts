import type { BoundaryFeature } from "./boundaries";

export type MatchBy = "name" | "iso3" | "iso2";
export const MATCH_BY_OPTIONS: readonly { id: MatchBy; label: string }[] = [
  { id: "name", label: "Country name" },
  { id: "iso3", label: "ISO 3-letter code (e.g. IND)" },
  { id: "iso2", label: "ISO 2-letter code (e.g. IN)" },
];

/** Strip accents and punctuation, lowercase, so "Côte d’Ivoire" and "cote d'ivoire" compare equal. */
export function normaliseName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Extra spellings people commonly use, keyed by ISO 3 code. These are names only; no geometry is involved. */
const ALIASES: Record<string, string[]> = {
  USA: ["USA", "US", "U.S.", "U.S.A.", "United States", "America"],
  GBR: ["UK", "U.K.", "Great Britain", "Britain", "United Kingdom of Great Britain and Northern Ireland"],
  RUS: ["Russian Federation"],
  KOR: ["Republic of Korea", "Korea, South", "Korea, Republic of", "Korea Republic"],
  PRK: ["DPRK", "Korea, North", "Democratic People's Republic of Korea"],
  COD: ["DR Congo", "DRC", "Democratic Republic of the Congo", "Congo, Democratic Republic of the", "Congo (Kinshasa)", "Congo-Kinshasa"],
  COG: ["Republic of the Congo", "Congo (Brazzaville)", "Congo-Brazzaville", "Congo, Republic of the"],
  CIV: ["Ivory Coast", "Cote d'Ivoire"],
  TZA: ["United Republic of Tanzania"],
  VNM: ["Viet Nam"],
  LAO: ["Lao PDR", "Lao People's Democratic Republic"],
  MMR: ["Burma"],
  CZE: ["Czech Republic"],
  SWZ: ["Swaziland", "Kingdom of Eswatini"],
  TLS: ["East Timor"],
  MKD: ["Macedonia"],
  TUR: ["Turkiye", "Türkiye"],
  SYR: ["Syrian Arab Republic"],
  IRN: ["Iran, Islamic Republic of", "Islamic Republic of Iran"],
  VEN: ["Venezuela, Bolivarian Republic of"],
  BOL: ["Plurinational State of Bolivia"],
  MDA: ["Republic of Moldova"],
  PSE: ["State of Palestine", "West Bank and Gaza", "Palestinian Territories"],
  BRN: ["Brunei Darussalam"],
  BIH: ["Bosnia", "Bosnia and Herzegovina"],
  ESH: ["Western Sahara"],
  FLK: ["Falkland Islands"],
  SLB: ["Solomon Islands"],
  ATF: ["French Southern and Antarctic Lands"],
  GMB: ["The Gambia"],
  BHS: ["The Bahamas"],
  ARE: ["UAE"],
  CYN: ["Northern Cyprus"],
  SSD: ["South Sudan"],
  GNQ: ["Equatorial Guinea"],
  CAF: ["Central African Republic"],
  DOM: ["Dominican Republic"],
};

export interface RegionIndex {
  byName: Map<string, number>;
  byIso3: Map<string, number>;
  byIso2: Map<string, number>;
}

export function buildRegionIndex(features: readonly BoundaryFeature[]): RegionIndex {
  const byName = new Map<string, number>();
  const byIso3 = new Map<string, number>();
  const byIso2 = new Map<string, number>();
  const add = (key: string | null | undefined, i: number) => {
    if (!key) return;
    const k = normaliseName(key);
    if (k && !byName.has(k)) byName.set(k, i); // first claim wins: primary names are added before alternatives
  };
  features.forEach((f, i) => add(f.properties.name, i));
  features.forEach((f, i) => {
    const p = f.properties;
    add(p.nameLong, i); add(p.admin, i); add(p.formal, i); add(p.brk, i);
    for (const a of (p.iso3 ? ALIASES[p.iso3] : undefined) ?? []) add(a, i);
    if (p.iso3) byIso3.set(p.iso3, i);
    if (p.iso2) byIso2.set(p.iso2, i);
  });
  // XK is the widely used unofficial code for Kosovo.
  const kosovo = features.findIndex((f) => f.properties.name === "Kosovo");
  if (kosovo >= 0 && !byIso2.has("XK")) byIso2.set("XK", kosovo);
  return { byName, byIso3, byIso2 };
}

export function matchRegion(index: RegionIndex, raw: string, by: MatchBy): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (by === "iso3") return index.byIso3.get(s.toUpperCase()) ?? null;
  if (by === "iso2") return index.byIso2.get(s.toUpperCase()) ?? null;
  return index.byName.get(normaliseName(s)) ?? null;
}

/** Try each strategy on the values and return the one that matches most (name wins ties). */
export function detectMatchBy(index: RegionIndex, values: readonly string[]): { by: MatchBy; rate: number } {
  const sample = values.filter((v) => v.trim() !== "").slice(0, 300);
  if (sample.length === 0) return { by: "name", rate: 0 };
  let best: { by: MatchBy; rate: number } = { by: "name", rate: -1 };
  for (const by of ["name", "iso3", "iso2"] as const) {
    const hits = sample.filter((v) => matchRegion(index, v, by) !== null).length;
    const rate = hits / sample.length;
    if (rate > best.rate) best = { by, rate };
  }
  return best;
}
