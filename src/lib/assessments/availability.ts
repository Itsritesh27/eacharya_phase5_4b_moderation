export type Availability = "upcoming" | "open" | "closed";

/** Mirrors is_assessment_open(): inside opens_at (inclusive) and closes_at (exclusive). */
export function availability(opensAt: string | null, closesAt: string | null, now: Date): Availability {
  if (closesAt && new Date(closesAt) <= now) return "closed";
  if (opensAt && new Date(opensAt) > now) return "upcoming";
  return "open";
}

export interface RuleInput {
  durationMinutes: number | null;
  attemptLimit: number | null;
  opensAt: string | null;
  closesAt: string | null;
}

/** Plain-language rules built only from columns that exist on assessments. */
export function describeRules(a: RuleInput, fmt: (iso: string) => string): string[] {
  const rules: string[] = [];
  rules.push(a.durationMinutes ? `You have ${a.durationMinutes} minutes.` : "There is no time limit.");
  rules.push(
    a.attemptLimit === null
      ? "You may attempt this assessment as many times as you like."
      : a.attemptLimit === 1
        ? "You may attempt this assessment once."
        : `You may attempt this assessment up to ${a.attemptLimit} times.`,
  );
  if (a.opensAt) rules.push(`Opens ${fmt(a.opensAt)}.`);
  if (a.closesAt) rules.push(`Closes ${fmt(a.closesAt)}.`);
  return rules;
}
