import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeImmunizationGaps, buildCorrectivePlan } from "./gapAnalysis.js";

const PATIENT_58_WITH_DIABETES = {
  dob: "1968-04-12",
  conditions: ["Type 2 diabetes mellitus", "Essential hypertension"],
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
