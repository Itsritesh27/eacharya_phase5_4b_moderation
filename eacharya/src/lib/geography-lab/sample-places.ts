/**
 * SAMPLE EDUCATIONAL DATA. Not a live or authoritative dataset.
 *
 * A small hand-written set of well-known places for classroom exploration.
 * Coordinates are approximate (about 3 to 4 decimal places) and descriptions are
 * simplified. Do not use for navigation, surveying or exact measurements.
 */
export interface SamplePlace {
  id: string;
  name: string;
  category: "Landform" | "Water" | "Reference line" | "Climate" | "Settlement";
  lat: number;
  lng: number;
  description: string;
}

export const SAMPLE_PLACES: readonly SamplePlace[] = [
  { id: "everest", name: "Mount Everest", category: "Landform", lat: 27.9881, lng: 86.925, description: "Earth's highest mountain above sea level, in the Himalayas on the Nepal-China border, at about 8,849 m." },
  { id: "greenwich", name: "Royal Observatory, Greenwich", category: "Reference line", lat: 51.4769, lng: -0.0005, description: "Marks the Prime Meridian (0° longitude), the reference line for measuring longitude and for world time zones." },
  { id: "quito", name: "Quito", category: "Reference line", lat: -0.1807, lng: -78.4678, description: "The capital of Ecuador lies very close to the Equator (0° latitude), yet it is cool because it stands high in the Andes." },
  { id: "delhi", name: "Delhi", category: "Settlement", lat: 28.6139, lng: 77.209, description: "India's capital, on the Yamuna river in the northern plains. Delhi is among the most populous urban areas in the world." },
  { id: "ujjain", name: "Ujjain", category: "Reference line", lat: 23.1765, lng: 75.7885, description: "A city in central India close to the Tropic of Cancer (about 23.4° N), which passes through eight Indian states." },
  { id: "sundarbans", name: "Sundarbans", category: "Water", lat: 21.9497, lng: 89.1833, description: "The delta of the Ganga, Brahmaputra and Meghna rivers, shared by India and Bangladesh, with the world's largest mangrove forest." },
  { id: "tamanrasset", name: "Tamanrasset", category: "Climate", lat: 22.785, lng: 5.5228, description: "An oasis town in the Algerian Sahara, in the world's largest hot desert, where rainfall is very low." },
  { id: "baikal", name: "Lake Baikal", category: "Water", lat: 53.5, lng: 108.0, description: "In Siberia, Russia. The world's deepest lake (over 1,600 m) and holds a large share of Earth's unfrozen fresh surface water." },
  { id: "challenger-deep", name: "Challenger Deep", category: "Landform", lat: 11.3733, lng: 142.5917, description: "In the Mariana Trench in the western Pacific, the deepest known point in the oceans, roughly 10.9 km below sea level." },
  { id: "dead-sea", name: "Dead Sea shore", category: "Water", lat: 31.5, lng: 35.5, description: "The shore of this salt lake is the lowest land surface on Earth, more than 400 m below sea level." },
];
