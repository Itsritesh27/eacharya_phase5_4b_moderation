export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export interface ClimateProfile {
  id: string;
  name: string;
  climateType: string;
  explanation: string;
  /** Illustrative monthly means; not observed or official station data. */
  temperatureC: readonly number[];
  /** Illustrative monthly rainfall totals; not observed or official station data. */
  rainfallMm: readonly number[];
}

export const CLIMATE_PROFILES: readonly ClimateProfile[] = [
  {
    id: "monsoon", name: "Tropical monsoon example", climateType: "Seasonal summer rainfall",
    explanation: "A strong wet season in the middle of the year and a warm climate throughout the year.",
    temperatureC: [20, 22, 26, 30, 33, 32, 30, 29, 29, 27, 24, 21],
    rainfallMm: [12, 18, 22, 35, 65, 180, 310, 290, 210, 90, 28, 12],
  },
  {
    id: "desert", name: "Hot desert example", climateType: "Very dry, hot summers",
    explanation: "Rainfall is very low for most months, while summer temperatures are high.",
    temperatureC: [14, 16, 21, 26, 31, 35, 37, 36, 32, 26, 20, 15],
    rainfallMm: [4, 5, 7, 4, 2, 0, 1, 1, 2, 4, 5, 4],
  },
  {
    id: "mediterranean", name: "Mediterranean example", climateType: "Wet winters, dry summers",
    explanation: "Most rain falls in the cooler half of the year, with a dry summer period.",
    temperatureC: [9, 10, 12, 15, 19, 23, 26, 26, 23, 18, 13, 10],
    rainfallMm: [80, 70, 60, 45, 25, 10, 3, 5, 20, 55, 80, 90],
  },
  {
    id: "highland", name: "Highland example", climateType: "Cooler temperatures, summer rain",
    explanation: "Higher elevation can keep temperatures comparatively low; rainfall peaks during summer.",
    temperatureC: [5, 7, 10, 14, 18, 21, 22, 21, 18, 14, 9, 6],
    rainfallMm: [20, 25, 35, 45, 70, 105, 125, 110, 75, 45, 30, 22],
  },
];

export interface ClimateSummary {
  annualRainfallMm: number;
  meanAnnualTemperatureC: number;
  warmestMonth: string;
  coolestMonth: string;
  wettestMonth: string;
  driestMonth: string;
}

export function summariseClimate(profile: ClimateProfile): ClimateSummary {
  const length = MONTHS.length;
  const temps = profile.temperatureC;
  const rain = profile.rainfallMm;
  if (temps.length !== length || rain.length !== length || temps.some((v) => !Number.isFinite(v)) || rain.some((v) => !Number.isFinite(v) || v < 0)) {
    throw new Error("Climate profile must contain 12 finite temperatures and 12 non-negative rainfall values.");
  }
  const indexOfMax = (values: readonly number[]) => values.indexOf(Math.max(...values));
  const indexOfMin = (values: readonly number[]) => values.indexOf(Math.min(...values));
  return {
    annualRainfallMm: rain.reduce((sum, value) => sum + value, 0),
    meanAnnualTemperatureC: temps.reduce((sum, value) => sum + value, 0) / 12,
    warmestMonth: MONTHS[indexOfMax(temps)]!,
    coolestMonth: MONTHS[indexOfMin(temps)]!,
    wettestMonth: MONTHS[indexOfMax(rain)]!,
    driestMonth: MONTHS[indexOfMin(rain)]!,
  };
}
