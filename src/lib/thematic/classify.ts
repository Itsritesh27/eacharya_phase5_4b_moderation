/**
 * Data classification for graduated colour maps.
 * `breaks` always has classCount + 1 entries: [min, b1, ..., max]. Class i covers [breaks[i], breaks[i+1]),
 * and the last class also includes its upper bound (the maximum).
 */
export type ClassMethod = "equal" | "quantile" | "natural";

export const CLASS_METHODS: readonly { id: ClassMethod; label: string; help: string }[] = [
  { id: "equal", label: "Equal interval", help: "Every class covers the same width of values." },
  { id: "quantile", label: "Quantile", help: "Each class holds about the same number of regions." },
  { id: "natural", label: "Natural breaks (Jenks)", help: "Classes are placed at the biggest gaps in the data." },
];

export const MIN_CLASSES = 3;
export const MAX_CLASSES = 7;
/** Fisher-Jenks is O(k·n²); above this many values it is switched off rather than freezing the page. */
export const NATURAL_BREAKS_MAX_VALUES = 1500;

export interface Classification {
  method: ClassMethod;
  breaks: number[];
  classCount: number;
  /** Number of values falling in each class. */
  counts: number[];
  /** Plain-language notes about any adjustment that was made (fewer classes, constant data, ...). */
  notes: string[];
}

export type ClassifyResult = { ok: true; value: Classification } | { ok: false; error: string };

export function classIndex(value: number, breaks: readonly number[]): number {
  const last = breaks.length - 2;
  if (last <= 0) return 0;
  for (let i = 0; i < last; i++) {
    if (value < breaks[i + 1]!) return i;
  }
  return last;
}

function equalBreaks(min: number, max: number, k: number): number[] {
  const step = (max - min) / k;
  const b = [min];
  for (let i = 1; i < k; i++) b.push(min + step * i);
  b.push(max);
  return b;
}

function quantileBreaks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  const b = [sorted[0]!];
  for (let i = 1; i < k; i++) {
    const pos = (i / k) * (n - 1);
    const lo = Math.floor(pos);
    const frac = pos - lo;
    const a = sorted[lo]!;
    const c = sorted[Math.min(lo + 1, n - 1)]!;
    b.push(a + (c - a) * frac);
  }
  b.push(sorted[n - 1]!);
  return b;
}

/** Fisher-Jenks optimal partition (the "Jenks natural breaks" algorithm). `sorted` must be ascending. */
export function jenksBreaks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  const lower: number[][] = [];
  const variance: number[][] = [];
  for (let i = 0; i <= n; i++) {
    lower.push(new Array<number>(k + 1).fill(0));
    variance.push(new Array<number>(k + 1).fill(Infinity));
  }
  for (let j = 1; j <= k; j++) {
    lower[1]![j] = 1;
    variance[1]![j] = 0;
  }
  for (let l = 2; l <= n; l++) {
    let sum = 0, sumSq = 0, w = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = sorted[i3 - 1]!;
      w += 1;
      sum += val;
      sumSq += val * val;
      const v = sumSq - (sum * sum) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          const cand = v + variance[i4]![j - 1]!;
          if (variance[l]![j]! >= cand) {
            lower[l]![j] = i3;
            variance[l]![j] = cand;
          }
        }
      }
    }
    lower[l]![1] = 1;
    variance[l]![1] = sumSqVariance(sorted, l);
  }
  const breaks = new Array<number>(k + 1);
  breaks[k] = sorted[n - 1]!;
  breaks[0] = sorted[0]!;
  let kk = n;
  for (let j = k; j >= 2; j--) {
    const id = lower[kk]![j]! - 2;
    breaks[j - 1] = sorted[id + 1]!; // lower bound of class j (class j starts at this value)
    kk = lower[kk]![j]! - 1;
  }
  return breaks;
}

function sumSqVariance(sorted: number[], l: number): number {
  let sum = 0, sumSq = 0;
  for (let i = 0; i < l; i++) { sum += sorted[i]!; sumSq += sorted[i]! * sorted[i]!; }
  return sumSq - (sum * sum) / l;
}

export function classify(values: readonly number[], method: ClassMethod, requestedClasses: number): ClassifyResult {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { ok: false, error: "There are no valid numbers to classify." };
  const sorted = clean.slice().sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const notes: string[] = [];
  const unique = new Set(sorted).size;

  if (min === max) {
    return {
      ok: true,
      value: {
        method, breaks: [min, max], classCount: 1, counts: [sorted.length],
        notes: ["Every value is the same, so there is only one class."],
      },
    };
  }

  let k = Math.max(1, Math.min(MAX_CLASSES, Math.round(requestedClasses)));
  if (unique < k) {
    k = unique;
    notes.push(`Only ${unique} different values, so ${unique} classes are used.`);
  }
  if (sorted.length < 2 * k && k > 2 && unique >= k) {
    // Very small datasets: keep going, but tell the student classes will be tiny.
    notes.push("This is a small dataset, so some classes hold only one or two regions.");
  }

  let breaks: number[];
  if (method === "equal") breaks = equalBreaks(min, max, k);
  else if (method === "quantile") breaks = quantileBreaks(sorted, k);
  else {
    if (sorted.length > NATURAL_BREAKS_MAX_VALUES) {
      return { ok: false, error: `Natural breaks is limited to ${NATURAL_BREAKS_MAX_VALUES} values. Choose equal interval or quantile.` };
    }
    breaks = jenksBreaks(sorted, k);
  }

  // Remove duplicate interior breaks (ties in quantile) so the legend never shows empty or zero-width classes.
  // The final break (the maximum) is always kept: when it equals the previous break, the top class holds
  // only the maximum value (a lone outlier), which is a legitimate natural-breaks result.
  const interior = breaks.slice(0, -1).filter((b, i, arr) => i === 0 || b > arr[i - 1]!);
  const deduped = [...interior, breaks[breaks.length - 1]!];
  if (deduped.length !== breaks.length) {
    notes.push(`Many values are identical, so the number of classes was reduced to ${deduped.length - 1}.`);
    breaks = deduped;
  }
  if (breaks.length < 2) breaks = [min, max];
  const classCount = breaks.length - 1;
  const counts = new Array<number>(classCount).fill(0);
  for (const v of sorted) counts[classIndex(v, breaks)]! += 1;
  return { ok: true, value: { method, breaks, classCount, counts, notes } };
}

/**
 * Number of decimals needed so every break prints as a different number, capped at 4.
 * Class labels use these rounded numbers, while colouring always uses the exact breaks.
 */
export function decimalsForBreaks(breaks: readonly number[]): number {
  const distinct = Array.from(new Set(breaks));
  for (let d = 0; d <= 4; d++) {
    const labels = distinct.map((b) => b.toFixed(d));
    if (new Set(labels).size === labels.length) return d;
  }
  return 4;
}
