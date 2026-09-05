import cdcSchedule from "../reference/cdc-adult-schedule.json" with { type: "json" };

export interface ImmunizationRecord {
  /** Free-text vaccine name, as extracted from the MCP get_immunizations output. */
  vaccine: string;
  /** ISO 8601 date (YYYY-MM-DD or full timestamp). */
  date: string;
  /** Optional CVX code, when available - matched in preference to the free-text name. */
  cvxCode?: string;
}

export interface PatientContext {
  /** ISO 8601 date of birth. */
  dob: string;
  /**
   * Free-text risk-factor strings matched against each rule's
   * riskConditionKeywords: active condition names from get_health_summary /
   * get_conditions (e.g. "Type 2 diabetes mellitus"), AND/OR patient-reported
   * occupational/lifestyle risk factors that structured EHR data doesn't
   * reliably capture (e.g. "microbiologist routinely exposed to Neisseria
   * meningitidis", "first-year college dormitory resident", "military
   * recruit") - see SKILL.md step 1 for when/how to ask for the latter.
   */
  conditions?: string[];
  /** Defaults to today; overridable for deterministic tests. */
  asOfDate?: string;
}

export type GapStatus =
  | "due_now"
  | "overdue"
  | "incomplete_series"
  | "shared_decision"
  | "verify_history"
  | "up_to_date"
  | "not_yet_applicable";

export interface GapResult {
  vaccine: string;
  status: GapStatus;
  rationale: string;
  recommendedAction: string;
  /** Roughly how soon this should happen, in plain language. */
  urgency: "now" | "soon" | "routine" | "discuss" | "none";
  source: string;
}

interface ScheduleRule {
  id: string;
  vaccine: string;
  matchHints: string[];
  /** CVX codes, when known - checked before matchHints since they're an exact, reliable match. */
  cvxCodes?: string[];
  minAge: number;
  maxAge?: number;
  type: "annual" | "primary-then-periodic" | "series" | "shared-decision" | "verify-history";
  intervalMonths?: number;
  intervalYears?: number;
  seriesDosesTotal?: number;
  minIntervalMonthsBetweenDoses?: number;
  riskConditionMinAge?: number;
  riskConditionKeywords?: string[];
  presumedImmuneBornBefore?: string;
  notes: string;
}

const RULES = cdcSchedule.rules as ScheduleRule[];

// All date math below reads UTC getters, not local ones. FHIR date-only
// strings ("1968-04-12") parse as UTC midnight; mixing that with local-time
// getters shifts the calendar date backward by one day in any timezone west
// of UTC, which previously made age/interval checks flip a day early.
function ageAt(dob: string, asOf: Date): number {
  const birth = new Date(dob);
  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const hadBirthday =
    asOf.getUTCMonth() > birth.getUTCMonth() ||
    (asOf.getUTCMonth() === birth.getUTCMonth() && asOf.getUTCDate() >= birth.getUTCDate());
  if (!hadBirthday) age -= 1;
  return age;
}

function monthsBetween(a: Date, b: Date): number {
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function matchesRule(record: ImmunizationRecord, rule: ScheduleRule): boolean {
  if (record.cvxCode && rule.cvxCodes?.includes(record.cvxCode)) return true;
  const name = record.vaccine.toLowerCase();
  return rule.matchHints.some((hint) => name.includes(hint));
}

function hasQualifyingCondition(conditions: string[] | undefined, keywords: string[]): boolean {
  if (!conditions?.length) return false;
  const lowerConditions = conditions.map((c) => c.toLowerCase());
  return keywords.some((kw) => lowerConditions.some((c) => c.includes(kw)));
}

/**
 * Evaluates a patient's immunization history against a simplified CDC adult
 * schedule. This is a demo-scale rule set (a handful of routine vaccines,
 * string-matched vaccine names, keyword-matched risk conditions) - a
 * production version would use structured CVX/SNOMED codes and the full ACIP
 * schedule, not substring matching. See README for that tradeoff.
 */
export function analyzeImmunizationGaps(
  immunizations: ImmunizationRecord[],
  patient: PatientContext
): GapResult[] {
  if (!patient.dob || !isValidDate(patient.dob)) {
    throw new Error(
      `Invalid or missing patient.dob (${JSON.stringify(patient.dob)}). ` +
        "Age-based vaccine eligibility can't be computed without a valid date of birth - " +
        "re-check the get_health_summary extraction in SKILL.md step 3 rather than proceeding."
    );
  }

  // Records with an unparseable date are excluded rather than silently
  // treated as valid - a garbage date must not be allowed to count as
  // evidence a dose was given, since that would report a real gap as
  // up-to-date. Excluding them instead falls back to each rule's "no dose on
  // record" branch, which is the conservative direction for a health tool.
  const dateValidImmunizations = immunizations.filter((imm) => {
    if (isValidDate(imm.date)) return true;
    console.warn(`Skipping immunization with unparseable date: ${JSON.stringify(imm)}`);
    return false;
  });

  // The real HealthEx MCP output was found (in live testing) to return
  // several duplicate rows per actual dose - the same administration
  // reported once per connected source system feeding that record. Without
  // deduplicating, "series"/"verify-history" rules would overcount doses
  // (e.g. a 2-dose MMR series reported 6+ times looks like "6 doses given").
  // Dedupe by CVX code when present (most reliable), else by lowercased
  // vaccine name, paired with the date.
  const seen = new Set<string>();
  const validImmunizations = dateValidImmunizations.filter((imm) => {
    const key = `${imm.cvxCode ?? imm.vaccine.toLowerCase()}|${imm.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const asOf = patient.asOfDate ? new Date(patient.asOfDate) : new Date();
  const age = ageAt(patient.dob, asOf);
  const results: GapResult[] = [];

  for (const rule of RULES) {
    const matches = validImmunizations
      .filter((imm) => matchesRule(imm, rule))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const mostRecent = matches[0];

    const appliesByAge =
      age >= rule.minAge &&
      (rule.maxAge === undefined || age <= rule.maxAge);
    const appliesByRisk =
      rule.riskConditionMinAge !== undefined &&
      age >= rule.riskConditionMinAge &&
      hasQualifyingCondition(patient.conditions, rule.riskConditionKeywords ?? []);

    if (!appliesByAge && !appliesByRisk) {
      // A dose can exist on record even when there's no ONGOING general
      // recommendation (e.g. a risk-only vaccine like meningococcal ACWY,
      // given years ago for an adolescent booster or a risk factor that no
      // longer applies/was never recorded). Don't imply nothing happened.
      const priorDoseNote = mostRecent
        ? ` A prior dose is on record (${mostRecent.date}), though it isn't driven by an ongoing recommendation at this age/risk profile.`
        : "";
      results.push({
        vaccine: rule.vaccine,
        status: "not_yet_applicable",
        rationale: `Not yet indicated at age ${age} (applies at ${rule.minAge}+${
          rule.riskConditionMinAge !== undefined
            ? ` or ${rule.riskConditionMinAge}+ with a qualifying risk factor`
            : ""
        }).${priorDoseNote}`,
        recommendedAction: "No action needed yet.",
        urgency: "none",
        source: rule.notes,
      });
      continue;
    }

    switch (rule.type) {
      case "annual": {
        const monthsSince = mostRecent ? monthsBetween(new Date(mostRecent.date), asOf) : Infinity;
        if (!mostRecent || monthsSince >= (rule.intervalMonths ?? 12)) {
          results.push({
            vaccine: rule.vaccine,
            status: mostRecent ? "overdue" : "due_now",
            rationale: mostRecent
              ? `Last dose was ${monthsSince} months ago; annual dose is overdue.`
              : "No dose on record.",
            recommendedAction: `Administer ${rule.vaccine} at next visit.`,
            urgency: "soon",
            source: rule.notes,
          });
        } else {
          results.push(upToDate(rule, mostRecent));
        }
        break;
      }

      case "primary-then-periodic": {
        if (!mostRecent) {
          results.push({
            vaccine: rule.vaccine,
            status: "due_now",
            rationale: "No Tdap/Td dose on record.",
            recommendedAction: `Administer a first dose of Tdap.`,
            urgency: "soon",
            source: rule.notes,
          });
          break;
        }
        const yearsSince = monthsBetween(new Date(mostRecent.date), asOf) / 12;
        if (yearsSince >= (rule.intervalYears ?? 10)) {
          results.push({
            vaccine: rule.vaccine,
            status: "overdue",
            rationale: `Last dose was ${yearsSince.toFixed(1)} years ago; a booster is due every ${rule.intervalYears} years.`,
            recommendedAction: "Administer a Td or Tdap booster.",
            urgency: "soon",
            source: rule.notes,
          });
        } else {
          results.push(upToDate(rule, mostRecent));
        }
        break;
      }

      case "series": {
        const dosesGiven = matches.length;
        const totalNeeded = rule.seriesDosesTotal ?? 1;
        if (dosesGiven === 0) {
          results.push({
            vaccine: rule.vaccine,
            status: "due_now",
            rationale: "No doses on record.",
            recommendedAction: `Begin the ${rule.vaccine} series (${totalNeeded} dose${totalNeeded > 1 ? "s" : ""}).`,
            urgency: "soon",
            source: rule.notes,
          });
        } else if (dosesGiven < totalNeeded) {
          results.push({
            vaccine: rule.vaccine,
            status: "incomplete_series",
            rationale: `${dosesGiven} of ${totalNeeded} doses on record.`,
            recommendedAction: `Schedule remaining dose${totalNeeded - dosesGiven > 1 ? "s" : ""} of ${rule.vaccine}.`,
            urgency: "soon",
            source: rule.notes,
          });
        } else {
          results.push(upToDate(rule, mostRecent));
        }
        break;
      }

      case "shared-decision": {
        const monthsSince = mostRecent ? monthsBetween(new Date(mostRecent.date), asOf) : Infinity;
        if (!mostRecent || monthsSince >= (rule.intervalMonths ?? 12)) {
          results.push({
            vaccine: rule.vaccine,
            status: "shared_decision",
            rationale: mostRecent
              ? `Last dose was ${monthsSince} months ago.`
              : "No dose on record.",
            recommendedAction: "Discuss current recommendation with a provider (shared clinical decision-making, not a strict requirement).",
            urgency: "discuss",
            source: rule.notes,
          });
        } else {
          results.push(upToDate(rule, mostRecent));
        }
        break;
      }

      case "verify-history": {
        if (rule.presumedImmuneBornBefore && new Date(patient.dob) < new Date(rule.presumedImmuneBornBefore)) {
          results.push({
            vaccine: rule.vaccine,
            status: "up_to_date",
            rationale: `Born before ${rule.presumedImmuneBornBefore.slice(0, 4)}; presumed immune per CDC guidance.`,
            recommendedAction: "No action needed.",
            urgency: "none",
            source: rule.notes,
          });
          break;
        }
        const dosesGiven = matches.length;
        const totalNeeded = rule.seriesDosesTotal ?? 1;
        if (dosesGiven >= totalNeeded) {
          results.push(upToDate(rule, mostRecent));
        } else {
          results.push({
            vaccine: rule.vaccine,
            status: "verify_history",
            rationale: `Only ${dosesGiven} of ${totalNeeded} documented doses found in this record. Older childhood immunizations are frequently missing from digital records rather than never having been given.`,
            recommendedAction: `Ask the patient/prior provider to confirm ${rule.vaccine} history before assuming doses are missing; vaccinate only if truly unconfirmed.`,
            urgency: "discuss",
            source: rule.notes,
          });
        }
        break;
      }
    }
  }

  return results;
}

function upToDate(rule: ScheduleRule, mostRecent?: ImmunizationRecord): GapResult {
  return {
    vaccine: rule.vaccine,
    status: "up_to_date",
    rationale: mostRecent ? `Most recent dose: ${mostRecent.date}.` : "Requirement satisfied.",
    recommendedAction: "No action needed.",
    urgency: "none",
    source: rule.notes,
  };
}

const URGENCY_ORDER: Record<GapResult["urgency"], number> = {
  now: 0,
  soon: 1,
  discuss: 2,
  routine: 3,
  none: 4,
};

export interface CorrectivePlanStep {
  step: number;
  vaccine: string;
  action: string;
  timing: string;
}

/** Turns the flagged (non up-to-date, non not-yet-applicable) gaps into an ordered action plan. */
export function buildCorrectivePlan(gaps: GapResult[]): CorrectivePlanStep[] {
  const actionable = gaps.filter((g) => g.status !== "up_to_date" && g.status !== "not_yet_applicable");
  const sorted = [...actionable].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  const timingByUrgency: Record<GapResult["urgency"], string> = {
    now: "At the next available appointment",
    soon: "Within the next 4-6 weeks",
    discuss: "Bring up at the next visit",
    routine: "At next annual physical",
    none: "N/A",
  };

  return sorted.map((gap, index) => ({
    step: index + 1,
    vaccine: gap.vaccine,
    action: gap.recommendedAction,
    timing: timingByUrgency[gap.urgency],
  }));
}
