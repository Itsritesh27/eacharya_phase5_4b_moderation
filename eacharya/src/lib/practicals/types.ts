import type { WeatherObservation } from "./weather";

export const PRACTICAL_GRADES = [9, 10, 11, 12] as const;
export type PracticalGrade = (typeof PRACTICAL_GRADES)[number];
export const DIFFICULTIES = ["Introductory", "Standard", "Advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type ColumnKind = "text" | "number" | "select";

export interface TableColumn {
  key: string;
  label: string;
  kind: ColumnKind;
  unit?: string;
  min?: number;
  max?: number;
  options?: readonly string[];
  /** Required for the row to count as complete. */
  required?: boolean;
}

/** Columns the student cannot type into: worked out from other cells. */
export type ComputedKind = "ground-km" | "compass" | "back-bearing";
export interface ComputedColumn {
  key: string;
  label: string;
  unit?: string;
  kind: ComputedKind;
  /** The input column the value is computed from. */
  from: string;
}

export interface ObservationTable {
  caption: string;
  columns: readonly TableColumn[];
  computed?: readonly ComputedColumn[];
  minRows: number;
  maxRows: number;
}

export interface MeasurementField {
  key: string;
  label: string;
  kind: "number" | "scale";
  unit?: string;
  min?: number;
  max?: number;
  hint?: string;
}

export type CalculatorKind = "scale" | "density" | "weather" | "relief";

export interface Practical {
  id: string;
  title: string;
  grade: PracticalGrade;
  topic: string;
  difficulty: Difficulty;
  minutes: number;
  summary: string;
  objectives: readonly string[];
  materials: readonly string[];
  steps: readonly string[];
  table?: ObservationTable;
  measurements: readonly MeasurementField[];
  calculator?: CalculatorKind;
  /** Key of the table column the relief calculator reads. */
  reliefColumn?: string;
  interpretationPrompt: string;
  /** Offer a link to the existing Interactive Map Explorer. */
  usesMapExplorer?: boolean;
}

export interface WorkspaceState {
  rows: Record<string, string>[];
  measurements: Record<string, string>;
  scale: { distance: string; unit: string; scale: string };
  density: { population: string; area: string; unit: string };
  weather: WeatherObservation[];
  interpretation: string;
  conclusion: string;
  reflection: string;
}

export const TEXT_LIMIT = 3000;
export const CELL_LIMIT = 200;
