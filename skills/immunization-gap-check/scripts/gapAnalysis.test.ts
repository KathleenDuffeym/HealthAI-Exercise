import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeImmunizationGaps, buildCorrectivePlan } from "./gapAnalysis.js";

const PATIENT_58_WITH_DIABETES = {
  dob: "1968-04-12",
  conditions: ["Type 2 diabetes mellitus", "Essential hypertension"],
  asOfDate: "2026-09-05",
};

// 22 years old as of 2026-09-05.
const YOUNG_ADULT_NO_RISK_FACTORS = {
  dob: "2004-05-04",
  conditions: [],
  asOfDate: "2026-09-05",
};

test("flags an overdue Tdap booster given more than 10 years since last dose", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Tdap", date: "2015-03-10" }],
    PATIENT_58_WITH_DIABETES
  );
  const tdap = gaps.find((g) => g.vaccine === "Tdap/Td");
  assert.equal(tdap?.status, "overdue");
});

test("matches a vaccine by CVX code even when its brand-name display text hits no substring alias", () => {
  // "Adacel" is a real Tdap brand name containing none of the matchHints
  // ("tdap", "td (tetanus", "tetanus") - only the CVX code identifies it.
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Adacel", date: "2015-03-10", cvxCode: "115" }],
    PATIENT_58_WITH_DIABETES
  );
  const tdap = gaps.find((g) => g.vaccine === "Tdap/Td");
  assert.equal(tdap?.status, "overdue");
});

test("deduplicates repeated rows for the same dose (as returned by real HealthEx MCP output) instead of overcounting a series", () => {
  // The live MCP tool returns several duplicate rows per actual dose - one
  // per connected source system reporting the same administration event.
  const shingrixDose1Reported4Times = Array.from({ length: 4 }, () => ({
    vaccine: "Shingrix",
    date: "2021-01-10",
    cvxCode: "187",
  }));
  const gaps = analyzeImmunizationGaps(shingrixDose1Reported4Times, PATIENT_58_WITH_DIABETES);
  const shingrix = gaps.find((g) => g.vaccine === "Zoster (Shingrix)");
  // 4 duplicate rows of the SAME dose must still read as 1 dose, not 4.
  assert.equal(shingrix?.status, "incomplete_series");
  assert.match(shingrix?.rationale ?? "", /1 of 2 doses/);
});

test("flags an incomplete Shingrix series when only 1 of 2 doses is on record", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Shingrix", date: "2021-01-10" }],
    PATIENT_58_WITH_DIABETES
  );
  const shingrix = gaps.find((g) => g.vaccine === "Zoster (Shingrix)");
  assert.equal(shingrix?.status, "incomplete_series");
});

test("recommends pneumococcal vaccine before 65 when a qualifying risk condition is present", () => {
  const gaps = analyzeImmunizationGaps([], PATIENT_58_WITH_DIABETES);
  const pneumo = gaps.find((g) => g.vaccine === "Pneumococcal (PCV/PPSV23)");
  assert.equal(pneumo?.status, "due_now");
});

test("does not recommend pneumococcal for a under-65 patient with no risk condition", () => {
  const gaps = analyzeImmunizationGaps([], { dob: "1968-04-12", conditions: [], asOfDate: "2026-09-05" });
  const pneumo = gaps.find((g) => g.vaccine === "Pneumococcal (PCV/PPSV23)");
  assert.equal(pneumo?.status, "not_yet_applicable");
});

test("treats missing MMR history as verify_history, not a hard gap, for someone born after 1957", () => {
  const gaps = analyzeImmunizationGaps([], PATIENT_58_WITH_DIABETES);
  const mmr = gaps.find((g) => g.vaccine === "MMR (Measles, Mumps, Rubella)");
  assert.equal(mmr?.status, "verify_history");
});

test("presumes MMR immunity for a patient born before 1957", () => {
  const gaps = analyzeImmunizationGaps([], { dob: "1950-01-01", asOfDate: "2026-09-05" });
  const mmr = gaps.find((g) => g.vaccine === "MMR (Measles, Mumps, Rubella)");
  assert.equal(mmr?.status, "up_to_date");
});

test("marks a fully up-to-date annual flu shot as such", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Influenza, injectable", date: "2026-08-01" }],
    PATIENT_58_WITH_DIABETES
  );
  const flu = gaps.find((g) => g.vaccine === "Influenza");
  assert.equal(flu?.status, "up_to_date");
});

test("corrective plan orders soon-urgency items before discuss-urgency items", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Tdap", date: "2015-03-10" }],
    PATIENT_58_WITH_DIABETES
  );
  const plan = buildCorrectivePlan(gaps);
  const tdapStepIndex = plan.findIndex((s) => s.vaccine === "Tdap/Td");
  const mmrStepIndex = plan.findIndex((s) => s.vaccine === "MMR (Measles, Mumps, Rubella)");
  assert.ok(tdapStepIndex >= 0 && mmrStepIndex >= 0);
  assert.ok(tdapStepIndex < mmrStepIndex, "overdue Tdap should be prioritized above verify-history MMR");
});

test("corrective plan excludes up-to-date and not-yet-applicable items", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Influenza", date: "2026-08-01" }],
    { dob: "1968-04-12", conditions: [], asOfDate: "2026-09-05" }
  );
  const plan = buildCorrectivePlan(gaps);
  assert.ok(!plan.some((s) => s.vaccine === "Influenza"));
  assert.ok(!plan.some((s) => s.vaccine === "Pneumococcal (PCV/PPSV23)"));
});

test("throws instead of silently returning wrong results when dob is missing", () => {
  assert.throws(() => {
    analyzeImmunizationGaps([], { dob: "", asOfDate: "2026-09-05" });
  }, /Invalid or missing patient\.dob/);
});

test("throws instead of silently returning wrong results when dob is unparseable", () => {
  assert.throws(() => {
    analyzeImmunizationGaps([], { dob: "not-a-date", asOfDate: "2026-09-05" });
  }, /Invalid or missing patient\.dob/);
});

test("skips an immunization record with an unparseable date rather than counting it as a valid dose", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Tdap", date: "unknown" }],
    PATIENT_58_WITH_DIABETES
  );
  const tdap = gaps.find((g) => g.vaccine === "Tdap/Td");
  // With the garbage-date record excluded, this must fall back to "no dose on record" (due_now),
  // not silently report up_to_date because the invalid date failed an interval comparison.
  assert.equal(tdap?.status, "due_now");
});

test("does not flag an annual dose as overdue a few days short of a full year (day-of-month aware)", () => {
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "Influenza", date: "2025-09-10" }],
    { ...PATIENT_58_WITH_DIABETES, asOfDate: "2026-09-05" }
  );
  const flu = gaps.find((g) => g.vaccine === "Influenza");
  assert.equal(flu?.status, "up_to_date");
});

test("age calculation does not shift a day early right before a birthday (UTC-safe)", () => {
  // Allison's dob is 1968-04-12. The day before her birthday, in any timezone,
  // she must still read as one year younger than on her actual birthday.
  const dayBefore = analyzeImmunizationGaps([], { dob: "1968-04-12", asOfDate: "2033-04-11" });
  const onBirthday = analyzeImmunizationGaps([], { dob: "1968-04-12", asOfDate: "2033-04-12" });
  const pneumoBefore = dayBefore.find((g) => g.vaccine === "Pneumococcal (PCV/PPSV23)");
  const pneumoOn = onBirthday.find((g) => g.vaccine === "Pneumococcal (PCV/PPSV23)");
  // Turning 65 on 2033-04-12 - the day before, she must not yet be eligible by age alone
  // (she still qualifies via her diabetes risk condition, which is exactly why this uses
  // a rule with a risk-condition path - so assert on age-only eligibility text instead).
  assert.ok(pneumoBefore?.rationale.includes("age 64"));
  assert.ok(pneumoOn?.rationale.includes("age 65") || pneumoOn?.status !== "not_yet_applicable");
});

test("HPV: 2 documented doses in the catch-up window reads as up to date", () => {
  const gaps = analyzeImmunizationGaps(
    [
      { vaccine: "HPV, quadrivalent", date: "2018-06-28", cvxCode: "62" },
      { vaccine: "HPV9", date: "2019-07-15", cvxCode: "165" },
    ],
    YOUNG_ADULT_NO_RISK_FACTORS
  );
  const hpv = gaps.find((g) => g.vaccine === "HPV");
  assert.equal(hpv?.status, "up_to_date");
});

test("HPV: no doses on record in the catch-up window is due now", () => {
  const gaps = analyzeImmunizationGaps([], YOUNG_ADULT_NO_RISK_FACTORS);
  const hpv = gaps.find((g) => g.vaccine === "HPV");
  assert.equal(hpv?.status, "due_now");
});

test("HPV: not applicable past the 26 catch-up cutoff", () => {
  const gaps = analyzeImmunizationGaps([], { dob: "1968-04-12", conditions: [], asOfDate: "2026-09-05" });
  const hpv = gaps.find((g) => g.vaccine === "HPV");
  assert.equal(hpv?.status, "not_yet_applicable");
});

test("Meningococcal ACWY: not flagged for a young adult with no documented risk factor", () => {
  const gaps = analyzeImmunizationGaps([], YOUNG_ADULT_NO_RISK_FACTORS);
  const menACWY = gaps.find((g) => g.vaccine === "Meningococcal ACWY");
  assert.equal(menACWY?.status, "not_yet_applicable");
  // Regression check for the riskConditionMinAge:0-is-falsy bug this rule exposed -
  // the rationale must still mention the risk-factor path, not silently drop it.
  assert.match(menACWY?.rationale ?? "", /qualifying risk factor/);
});

test("Meningococcal ACWY: flagged due_now for a first-year dorm resident with no dose on record", () => {
  const gaps = analyzeImmunizationGaps([], {
    ...YOUNG_ADULT_NO_RISK_FACTORS,
    conditions: ["First-year college dormitory resident"],
  });
  const menACWY = gaps.find((g) => g.vaccine === "Meningococcal ACWY");
  assert.equal(menACWY?.status, "due_now");
});

test("Meningococcal ACWY: risk-based applicability works regardless of age (not just young adults)", () => {
  const gaps = analyzeImmunizationGaps([], {
    dob: "1968-04-12",
    conditions: ["Asplenia"],
    asOfDate: "2026-09-05",
  });
  const menACWY = gaps.find((g) => g.vaccine === "Meningococcal ACWY");
  assert.equal(menACWY?.status, "due_now");
});

test("Meningococcal ACWY: not_yet_applicable still surfaces a documented prior dose instead of implying nothing happened", () => {
  // Real case found via live testing: a patient can have completed the routine
  // adolescent MenACWY primary+booster years ago with no ongoing risk factor now -
  // the rule correctly has no ONGOING recommendation, but must not imply the
  // patient was never vaccinated when a dose is right there on record.
  const gaps = analyzeImmunizationGaps(
    [{ vaccine: "meningococcal MCV4P", date: "2020-08-03", cvxCode: "114" }],
    YOUNG_ADULT_NO_RISK_FACTORS
  );
  const menACWY = gaps.find((g) => g.vaccine === "Meningococcal ACWY");
  assert.equal(menACWY?.status, "not_yet_applicable");
  assert.match(menACWY?.rationale ?? "", /prior dose is on record \(2020-08-03\)/);
});

test("Meningococcal B: shared-decision for a 16-23 year old with no risk factor and no dose", () => {
  const gaps = analyzeImmunizationGaps([], { dob: "2008-01-01", conditions: [], asOfDate: "2026-09-05" });
  const menB = gaps.find((g) => g.vaccine === "Meningococcal B");
  assert.equal(menB?.status, "shared_decision");
});

test("Meningococcal B: not applicable outside 16-23 with no qualifying occupational risk factor", () => {
  const gaps = analyzeImmunizationGaps([], YOUNG_ADULT_NO_RISK_FACTORS); // 22, but no risk factor and this is testing >23 case below
  const older = analyzeImmunizationGaps([], { dob: "1968-04-12", conditions: [], asOfDate: "2026-09-05" });
  const menB = older.find((g) => g.vaccine === "Meningococcal B");
  assert.equal(menB?.status, "not_yet_applicable");
});

test("Meningococcal B: lab-exposure risk factor triggers shared-decision outside the 16-23 age window", () => {
  const gaps = analyzeImmunizationGaps([], {
    dob: "1968-04-12",
    conditions: ["Microbiologist routinely exposed to Neisseria meningitidis isolates"],
    asOfDate: "2026-09-05",
  });
  const menB = gaps.find((g) => g.vaccine === "Meningococcal B");
  assert.equal(menB?.status, "shared_decision");
});

test("Meningococcal B: general healthcare employment alone does not trigger it (not a real ACIP indication)", () => {
  const gaps = analyzeImmunizationGaps([], {
    dob: "1968-04-12",
    conditions: ["Works as a hospital nurse"],
    asOfDate: "2026-09-05",
  });
  const menB = gaps.find((g) => g.vaccine === "Meningococcal B");
  assert.equal(menB?.status, "not_yet_applicable");
});
