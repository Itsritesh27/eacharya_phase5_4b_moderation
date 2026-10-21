import { DIFFICULTIES, PRACTICAL_GRADES, type Difficulty, type Practical, type PracticalGrade } from "./types";

/**
 * Starter practical catalogue.
 *
 * ILLUSTRATIVE CONTENT: written for this platform as examples. It has NOT been reviewed or approved by any
 * board or curriculum authority, and class levels are suggestions. This is code, not database content: no
 * activities table exists yet. Replace with real data once a table and an approval process exist.
 */
export const CATALOGUE_NOTICE =
  "Starter catalogue: illustrative activities written for eAcharya. They are not formally approved or aligned to any board syllabus, and class levels are suggestions.";

const SCALE_FIELD = { key: "scale", label: "Map scale", kind: "scale", hint: "For example 1:50,000" } as const;

export const PRACTICALS: readonly Practical[] = [
  {
    id: "g9-latitude-longitude",
    title: "Latitude and longitude identification",
    grade: 9,
    topic: "Latitude and longitude",
    difficulty: "Introductory",
    minutes: 25,
    summary: "Read the coordinates of six places from the Map Explorer and record them correctly.",
    objectives: ["Read latitude and longitude from a map.", "State whether a place is north or south, and east or west.", "Use decimal degrees accurately."],
    materials: ["Device with the Interactive Map Explorer", "Notebook and pencil", "A list of six places you know"],
    steps: [
      "Open the Interactive Map Explorer in a new tab.",
      "Search or pan to the first place and click on it.",
      "Copy the latitude and longitude shown for that click.",
      "Enter the place name and coordinates in the table (south and west are negative).",
      "Repeat for at least four places on different continents if you can.",
      "Compare your places: which is closest to the Equator?",
    ],
    table: {
      caption: "Coordinates of places",
      minRows: 4,
      maxRows: 12,
      columns: [
        { key: "place", label: "Place", kind: "text", required: true },
        { key: "lat", label: "Latitude", kind: "number", unit: "°", min: -90, max: 90, required: true },
        { key: "lng", label: "Longitude", kind: "number", unit: "°", min: -180, max: 180, required: true },
      ],
    },
    measurements: [],
    interpretationPrompt: "Which of your places is closest to the Equator and which is closest to the Prime Meridian? How can you tell from the numbers?",
    usesMapExplorer: true,
  },
  {
    id: "g9-map-scale-distance",
    title: "Map scale and distance calculation",
    grade: 9,
    topic: "Maps and scale",
    difficulty: "Introductory",
    minutes: 30,
    summary: "Measure distances on a map and convert them to real distances using the scale.",
    objectives: ["Read a representative fraction such as 1:50,000.", "Convert a measured map distance to a ground distance.", "Check units at every step."],
    materials: ["A printed or on-screen map with a scale", "Ruler marked in mm and cm", "Notebook and calculator"],
    steps: [
      "Find the scale on your map and write it in the Map scale field.",
      "Choose four pairs of places and measure the straight-line distance between each pair in centimetres.",
      "Enter each measurement in the table; the ground distance is worked out for you.",
      "Use the Map Scale Calculator to check one result step by step.",
      "Check one answer by hand and note any difference.",
    ],
    table: {
      caption: "Measured distances",
      minRows: 4,
      maxRows: 10,
      columns: [
        { key: "pair", label: "From to", kind: "text", required: true },
        { key: "cm", label: "Map distance", kind: "number", unit: "cm", min: 0.1, max: 200, required: true },
      ],
      computed: [{ key: "km", label: "Ground distance", unit: "km", kind: "ground-km", from: "cm" }],
    },
    measurements: [SCALE_FIELD],
    calculator: "scale",
    interpretationPrompt: "Which pair of places is farthest apart? Name two things that could make your measurement slightly wrong.",
  },
  {
    id: "g10-direction-bearing",
    title: "Direction and bearing",
    grade: 10,
    topic: "Maps and direction",
    difficulty: "Standard",
    minutes: 30,
    summary: "Estimate bearings between places on a map and work out the matching compass direction and back bearing.",
    objectives: ["Express direction as a bearing from north.", "Convert a bearing to a compass direction.", "Find the back bearing of a route."],
    materials: ["A map with a north arrow", "Protractor", "Pencil and ruler"],
    steps: [
      "Mark the starting place and a destination on the map.",
      "Draw a line joining them and a north line through the start.",
      "Measure the angle clockwise from north with the protractor.",
      "Enter the bearing; the compass direction and back bearing are worked out for you.",
      "Repeat for at least three routes.",
    ],
    table: {
      caption: "Bearings between places",
      minRows: 3,
      maxRows: 10,
      columns: [
        { key: "from", label: "From", kind: "text", required: true },
        { key: "to", label: "To", kind: "text", required: true },
        { key: "bearing", label: "Bearing", kind: "number", unit: "°", min: 0, max: 359.99, required: true },
      ],
      computed: [
        { key: "compass", label: "Compass direction", kind: "compass", from: "bearing" },
        { key: "back", label: "Back bearing", unit: "°", kind: "back-bearing", from: "bearing" },
      ],
    },
    measurements: [],
    interpretationPrompt: "How are a bearing and its back bearing related? Check this with one of your routes.",
    usesMapExplorer: true,
  },
  {
    id: "g10-local-field-survey",
    title: "Local geographical field survey",
    grade: 10,
    topic: "Fieldwork",
    difficulty: "Advanced",
    minutes: 60,
    summary: "Survey land use along a short route near school or home and report what you found.",
    objectives: ["Plan and carry out a simple field survey safely.", "Record observations systematically.", "Draw a conclusion supported by your own data."],
    materials: ["Notebook and pencil", "Clipboard or hard-backed book", "Adult supervision or permission", "Optional: phone for photographs (keep them on your device)"],
    steps: [
      "Choose a short, safe route with an adult's permission and note it on paper.",
      "Divide the route into five stops about the same distance apart.",
      "At each stop record the main land use you can see and count the buildings in view.",
      "Enter your observations in the table when you are back indoors.",
      "Enter the total route length and the survey time in the measurement fields.",
      "Write what pattern you found and how you could improve the survey.",
    ],
    table: {
      caption: "Survey stops",
      minRows: 5,
      maxRows: 12,
      columns: [
        { key: "stop", label: "Stop", kind: "text", required: true },
        { key: "landuse", label: "Main land use", kind: "select", options: ["Residential", "Commercial", "Agricultural", "Industrial", "Open space", "Water body", "Other"], required: true },
        { key: "buildings", label: "Buildings in view", kind: "number", min: 0, max: 1000, required: true },
      ],
    },
    measurements: [
      { key: "route", label: "Route length", kind: "number", unit: "m", min: 1, max: 20000 },
      { key: "duration", label: "Survey time", kind: "number", unit: "min", min: 1, max: 600 },
    ],
    interpretationPrompt: "Describe the pattern of land use along your route and suggest one reason for it.",
    usesMapExplorer: true,
  },
  {
    id: "g11-weather-rainfall",
    title: "Weather observation and rainfall recording",
    grade: 11,
    topic: "Climate and weather",
    difficulty: "Standard",
    minutes: 35,
    summary: "Keep a short weather log of temperature and rainfall and summarise it.",
    objectives: ["Record temperature and rainfall consistently.", "Calculate the average temperature and total rainfall.", "Tell your own observations apart from official weather data."],
    materials: ["Thermometer (°C)", "Rain gauge or a straight-sided container with a ruler", "Notebook"],
    steps: [
      "Choose a shady, open place and observe at about the same time each day.",
      "Read the temperature and the rainfall collected in the last 24 hours (mm).",
      "Enter each day in the Weather Observation Log below; use 0 for a dry day.",
      "Record at least five days. Humidity is optional.",
      "Read the summary and describe the pattern in your own words.",
    ],
    measurements: [],
    calculator: "weather",
    interpretationPrompt: "What pattern do you see in temperature and rainfall? Does your log match what you expected for the season?",
  },
  {
    id: "g11-contour-relief",
    title: "Contour and relief interpretation",
    grade: 11,
    topic: "Landforms and relief",
    difficulty: "Advanced",
    minutes: 40,
    summary: "Read heights from a contour map and describe the relief and slope.",
    objectives: ["Read spot heights from contour lines.", "Calculate relief (highest minus lowest).", "Describe slope from contour spacing."],
    materials: ["A topographic or contour map", "Pencil and ruler", "Calculator"],
    steps: [
      "Choose at least five points on the contour map.",
      "Read the height of each point from the nearest contour or spot height.",
      "Enter the point and its height in metres.",
      "Read the relief summary the calculator produces.",
      "Look at where contours are close together and where they are far apart.",
    ],
    table: {
      caption: "Heights read from the map",
      minRows: 5,
      maxRows: 15,
      columns: [
        { key: "point", label: "Point", kind: "text", required: true },
        { key: "height", label: "Height", kind: "number", unit: "m", min: -500, max: 9000, required: true },
        { key: "slope", label: "Nearby slope", kind: "select", options: ["Gentle (contours far apart)", "Moderate", "Steep (contours close together)"], required: true },
      ],
    },
    measurements: [],
    calculator: "relief",
    reliefColumn: "height",
    interpretationPrompt: "Where is the land steepest and how can you tell from the contour lines?",
  },
  {
    id: "g12-population-density",
    title: "Population density calculation",
    grade: 12,
    topic: "Population",
    difficulty: "Standard",
    minutes: 30,
    summary: "Calculate population density for several areas and compare them.",
    objectives: ["Calculate density as people per square kilometre.", "Compare densities between areas.", "Suggest reasons for differences."],
    materials: ["Population and area figures for at least three areas from a source you can name", "Calculator"],
    steps: [
      "Choose three or more districts, states or countries and note your data source in the Source field.",
      "Enter the population and the area of each in the table.",
      "Use the Population Density Calculator to work one out step by step.",
      "Check that your table values agree with the calculator.",
      "Rank the areas from least to most densely populated.",
    ],
    table: {
      caption: "Population and area",
      minRows: 3,
      maxRows: 10,
      columns: [
        { key: "area_name", label: "Area", kind: "text", required: true },
        { key: "population", label: "Population", kind: "number", unit: "people", min: 0, max: 20000000000, required: true },
        { key: "area", label: "Area", kind: "number", unit: "km²", min: 0.001, max: 520000000, required: true },
      ],
    },
    measurements: [],
    calculator: "density",
    interpretationPrompt: "Which area is most densely populated? Suggest two geographical or economic reasons.",
  },
  {
    id: "g12-settlement-pattern",
    title: "Settlement pattern observation",
    grade: 12,
    topic: "Human settlements",
    difficulty: "Standard",
    minutes: 35,
    summary: "Identify the pattern of settlements in a map area and give reasons.",
    objectives: ["Identify nucleated, linear and dispersed patterns.", "Link a pattern to a physical feature.", "Support a claim with evidence from a map."],
    materials: ["Map extract or the Interactive Map Explorer", "Pencil", "Notebook"],
    steps: [
      "Pick a map area at least 10 km across.",
      "Mark at least four settlements or groups of buildings.",
      "Decide whether each group is clustered, strung along a line, or spread out.",
      "Note the nearby feature that might explain it (river, road, hill, coast).",
      "Enter your observations in the table.",
    ],
    table: {
      caption: "Settlement observations",
      minRows: 4,
      maxRows: 10,
      columns: [
        { key: "site", label: "Settlement or site", kind: "text", required: true },
        { key: "pattern", label: "Pattern", kind: "select", options: ["Nucleated (clustered)", "Linear", "Dispersed", "Other"], required: true },
        { key: "feature", label: "Nearby feature", kind: "text", required: true },
      ],
    },
    measurements: [],
    interpretationPrompt: "Which physical or human factor best explains the pattern you saw? Give evidence from your table.",
    usesMapExplorer: true,
  },
];

export function getPractical(id: string): Practical | undefined {
  return PRACTICALS.find((p) => p.id === id);
}

export function topicsList(): string[] {
  return Array.from(new Set(PRACTICALS.map((p) => p.topic))).sort();
}

export interface LibraryFilters {
  q?: string;
  grade?: PracticalGrade;
  topic?: string;
  difficulty?: Difficulty;
}

export function parseGradeParam(v: string | undefined): PracticalGrade | undefined {
  const n = Number(v);
  return (PRACTICAL_GRADES as readonly number[]).includes(n) ? (n as PracticalGrade) : undefined;
}
export function parseDifficultyParam(v: string | undefined): Difficulty | undefined {
  return (DIFFICULTIES as readonly string[]).includes(v ?? "") ? (v as Difficulty) : undefined;
}
export function parseTopicParam(v: string | undefined): string | undefined {
  return v && topicsList().includes(v) ? v : undefined;
}

/** Search matches title, topic, summary and objectives; case-insensitive; query capped at 80 characters. */
export function filterPracticals(filters: LibraryFilters, all: readonly Practical[] = PRACTICALS): Practical[] {
  const q = (filters.q ?? "").trim().toLowerCase().slice(0, 80);
  return all.filter((p) => {
    if (filters.grade && p.grade !== filters.grade) return false;
    if (filters.topic && p.topic !== filters.topic) return false;
    if (filters.difficulty && p.difficulty !== filters.difficulty) return false;
    if (!q) return true;
    return [p.title, p.topic, p.summary, ...p.objectives].some((s) => s.toLowerCase().includes(q));
  });
}
