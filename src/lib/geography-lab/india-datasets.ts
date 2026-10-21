import datasetJson from "./india-datasets.json";

export type GeographyDatasetValue = string | number | null;

export interface GeographyDatasetColumn {
  key: string;
  label: string;
}

export interface GeographyDatasetSource {
  label: string;
  url: string;
}

export interface GeographyDataset {
  id: string;
  category: string;
  title: string;
  description: string;
  period: string;
  geography: string;
  unit: string;
  sourceLabel: string;
  sourceUrl: string;
  extraSources: GeographyDatasetSource[];
  caveat: string;
  columns: GeographyDatasetColumn[];
  rows: Record<string, GeographyDatasetValue>[];
  visualKey: string | null;
  visualLabel: string | null;
  visualUnit: string | null;
}

/**
 * Locally bundled, source-attributed starter datasets for Class 9–12 projects.
 * Historical, selected or synthetic scopes are identified in each dataset's
 * period/caveat fields; the UI must not describe these as current complete data.
 */
export const INDIA_GEOGRAPHY_DATASETS = datasetJson as unknown as readonly GeographyDataset[];
