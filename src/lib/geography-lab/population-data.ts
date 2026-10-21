export interface PopulationProfile {
  id: string;
  name: string;
  description: string;
  population: number;
  previousPopulation: number;
  areaKm2: number;
  age0to14Pct: number;
  age15to59Pct: number;
  age60PlusPct: number;
}

/** Illustrative synthetic examples. They are not official statistics for real places. */
export const POPULATION_PROFILES: readonly PopulationProfile[] = [
  { id: "urban", name: "Dense urban example", description: "Many people in a relatively small area.", population: 1_200_000, previousPopulation: 1_015_000, areaKm2: 120, age0to14Pct: 20, age15to59Pct: 68, age60PlusPct: 12 },
  { id: "rural", name: "Rural plains example", description: "Settlements spread over a larger agricultural area.", population: 850_000, previousPopulation: 772_727, areaKm2: 1_700, age0to14Pct: 25, age15to59Pct: 63, age60PlusPct: 12 },
  { id: "industrial", name: "Industrial corridor example", description: "A growing employment centre with a high working-age share.", population: 640_000, previousPopulation: 533_333, areaKm2: 410, age0to14Pct: 19, age15to59Pct: 72, age60PlusPct: 9 },
  { id: "highland", name: "Mountain region example", description: "Smaller settlements separated by difficult terrain.", population: 180_000, previousPopulation: 171_429, areaKm2: 2_400, age0to14Pct: 22, age15to59Pct: 64, age60PlusPct: 14 },
  { id: "coastal", name: "Coastal settlement example", description: "A settlement influenced by coastal livelihoods and trade.", population: 420_000, previousPopulation: 388_889, areaKm2: 560, age0to14Pct: 23, age15to59Pct: 65, age60PlusPct: 12 },
];

export interface PopulationMetrics {
  densityPerKm2: number;
  growthPercent: number;
  ageSharesTotal: number;
}

export function calculatePopulationMetrics(profile: PopulationProfile): PopulationMetrics {
  if (!Number.isFinite(profile.population) || profile.population < 0 || !Number.isFinite(profile.previousPopulation) || profile.previousPopulation <= 0 || !Number.isFinite(profile.areaKm2) || profile.areaKm2 <= 0) {
    throw new Error("Population and previous population must be valid, and area must be greater than zero.");
  }
  const ageValues = [profile.age0to14Pct, profile.age15to59Pct, profile.age60PlusPct];
  if (ageValues.some((value) => !Number.isFinite(value) || value < 0 || value > 100) || Math.abs(ageValues.reduce((sum, value) => sum + value, 0) - 100) > 0.01) {
    throw new Error("Age-group percentages must be between 0 and 100 and add up to 100.");
  }
  return {
    densityPerKm2: profile.population / profile.areaKm2,
    growthPercent: ((profile.population - profile.previousPopulation) / profile.previousPopulation) * 100,
    ageSharesTotal: ageValues.reduce((sum, value) => sum + value, 0),
  };
}
