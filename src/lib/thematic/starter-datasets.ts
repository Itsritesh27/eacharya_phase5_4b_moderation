import type { BoundaryFeature } from "./boundaries";
import type { Dataset } from "./series";
import { SAMPLE_PLACES } from "@/lib/geography-lab/sample-places";

/**
 * Demonstration datasets. Nothing here is current official statistics.
 *  - "population": taken from the Natural Earth boundary file itself (POP_EST), an approximate estimate.
 *  - "practice": SYNTHETIC numbers invented for practising classification and legends. Not real.
 */
export const STARTER_IDS = { population: "starter-population", practice: "starter-practice" } as const;

const PRACTICE_VALUES: ReadonlyArray<readonly [string, number]> = [
  ["India", 62], ["China", 48], ["Brazil", 83], ["Australia", 21], ["Canada", 35], ["Egypt", 12],
  ["Nigeria", 91], ["Kenya", 57], ["Russia", 29], ["Germany", 74], ["France", 66], ["Argentina", 44],
  ["Mexico", 38], ["Indonesia", 96], ["Japan", 52], ["South Africa", 17], ["Saudi Arabia", 9],
  ["Norway", 79], ["Peru", 70], ["Pakistan", 33], ["Algeria", 14], ["Iran", 26],
];

export function buildStarterDatasets(features: readonly BoundaryFeature[]): Dataset[] {
  const popYears = Array.from(new Set(features.map((f) => f.properties.popYear))).sort();
  const yearText = popYears.length === 1 ? `${popYears[0]}` : `${popYears[0]}–${popYears[popYears.length - 1]}`;
  const sorted = features.slice().sort((a, b) => a.properties.name.localeCompare(b.properties.name));

  return [
    {
      id: STARTER_IDS.population,
      title: "Population estimate by country",
      description: `Approximate population of each country around ${yearText}. A demonstration dataset, not current official statistics.`,
      origin: "starter",
      synthetic: false,
      source: "Natural Earth 1:110m Admin 0 Countries, field POP_EST (public domain). Estimates only; not an official census or UN figure.",
      columns: ["Country", "Population (estimate)"],
      rows: sorted.map((f) => [f.properties.name, String(f.properties.pop)]),
      regionColumn: 0,
      matchBy: "name",
      latColumn: null,
      lngColumn: null,
      indicators: [{ column: 1, label: "Population (estimate)", unit: "people" }],
    },
    {
      id: STARTER_IDS.practice,
      title: "Practice scores (SYNTHETIC)",
      description: "Made-up numbers for 22 countries, for practising classes, colours and legends. They do not measure anything real.",
      origin: "starter",
      synthetic: true,
      source: "Synthetic data invented for this lesson. Not official data. Do not quote these numbers.",
      columns: ["Country", "Practice score"],
      rows: PRACTICE_VALUES.map(([n, v]) => [n, String(v)]),
      regionColumn: 0,
      matchBy: "name",
      latColumn: null,
      lngColumn: null,
      indicators: [{ column: 1, label: "Practice score", unit: "points" }],
    },
  ];
}

/** Example CSV shown in the import panel. Values are SYNTHETIC; coordinates come from the Phase 4.2 sample places. */
const SAMPLE_VALUES: Record<string, readonly [country: string, value: number]> = {
  delhi: ["India", 80], greenwich: ["United Kingdom", 35], quito: ["Ecuador", 10],
  everest: ["Nepal", 55], tamanrasset: ["Algeria", 20], baikal: ["Russia", 95],
};

export const SAMPLE_CSV_TEXT: string = [
  "place,country,latitude,longitude,practice_value",
  ...SAMPLE_PLACES.filter((p) => p.id in SAMPLE_VALUES).map((p) => {
    const [country, value] = SAMPLE_VALUES[p.id]!;
    return [p.name.includes(",") ? `"${p.name}"` : p.name, country, p.lat, p.lng, value].join(",");
  }),
].join("\n");
