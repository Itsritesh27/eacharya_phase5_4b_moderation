/**
 * Geography Lab catalogue.
 * Tool entries link only to implemented routes. The starter activity list is
 * derived from the practical catalogue; the source-attributed India dataset
 * library is bundled locally in src/lib/geography-lab/india-datasets.json.
 *
 * Phase 4.4: the activity list is derived from src/lib/practicals/catalogue.ts
 * so there is one source of truth for practical activities.
 */
import { PRACTICALS } from "@/lib/practicals/catalogue";

export const LAB_GRADES = [9, 10, 11, 12] as const;
export type LabGrade = (typeof LAB_GRADES)[number];

export type LabToolId = "map" | "latlong" | "thematic" | "climate" | "population" | "fieldwork" | "datasets";

export interface LabTool {
  id: LabToolId;
  title: string;
  description: string;
  /** Present only when the destination exists. Absent = coming soon. */
  href?: string;
}

export const LAB_TOOLS: readonly LabTool[] = [
  { id: "map", title: "Interactive Map Explorer", description: "Pan and zoom a world map, read latitude and longitude, and explore sample places.", href: "/geography-lab/map-explorer" },
  { id: "latlong", title: "Latitude and Longitude Explorer", description: "Locate places by coordinates and see how the grid works.", href: "/geography-lab/latitude-longitude" },
  { id: "thematic", title: "Thematic Map Studio", description: "Turn a data table into a shaded or symbol map.", href: "/geography-lab/thematic-map-studio" },
  { id: "climate", title: "Climate Data Explorer", description: "Read climographs and compare temperature and rainfall.", href: "/geography-lab/climate-explorer" },
  { id: "population", title: "Population Data Explorer", description: "Study density, growth and age structure with charts.", href: "/geography-lab/population-explorer" },
  { id: "fieldwork", title: "Fieldwork and Practical Activities", description: "Hands-on tasks you can do with a map, a notebook and your surroundings.", href: "/geography-lab/practicals" },
  { id: "datasets", title: "India Geography Datasets", description: "Explore and download sourced datasets on climate, population, agriculture, infrastructure and hazards.", href: "/geography-lab/india-datasets" },
];

export interface LabActivity {
  id: string;
  title: string;
  grade: LabGrade;
  topic: string;
  objective: string;
  minutes: number;
}

export const STARTER_ACTIVITIES: readonly LabActivity[] = PRACTICALS.map((p) => ({
  id: p.id,
  title: p.title,
  grade: p.grade,
  topic: p.topic,
  objective: p.objectives[0] ?? p.summary,
  minutes: p.minutes,
}));

/** Accepts only 9-12 from a query string; anything else means "all classes". */
export function parseGrade(value: string | undefined): LabGrade | undefined {
  const n = Number(value);
  return (LAB_GRADES as readonly number[]).includes(n) ? (n as LabGrade) : undefined;
}

export function activitiesForGrade(grade: LabGrade | undefined): readonly LabActivity[] {
  return grade ? STARTER_ACTIVITIES.filter((a) => a.grade === grade) : STARTER_ACTIVITIES;
}

export function formatMinutes(minutes: number): string {
  return `${minutes} min`;
}
