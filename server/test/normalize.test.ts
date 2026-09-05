import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePatientSummary } from "../src/fhir/normalize.js";
import type { FhirBundle } from "../src/fhir/types.js";

function bundleWith(...resources: FhirBundle["entry"]): FhirBundle {
  return { resourceType: "Bundle", type: "searchset", entry: resources };
}

test("calculates age correctly when the birthday has already passed this year", () => {
  const summary = normalizePatientSummary(
    bundleWith({
      resource: { resourceType: "Person", id: "p1", birthDate: "1968-01-01" },
    })
  );
  // Any "today" after Jan 1 in the test-running year should read as already-had-birthday.
  const expectedAge = new Date().getFullYear() - 1968;
  assert.equal(summary.patient.age, expectedAge);
});

test("calculates age correctly when the birthday has not yet happened this year", () => {
  const farFutureBirthMonth = "12-31"; // Dec 31 - essentially never already passed
  const summary = normalizePatientSummary(
    bundleWith({
      resource: { resourceType: "Person", id: "p1", birthDate: `1968-${farFutureBirthMonth}` },
    })
  );
  const expectedAge = new Date().getFullYear() - 1968 - 1;
  assert.equal(summary.patient.age, expectedAge);
});

test("groups multi-component observations (e.g. blood pressure) into one readable value", () => {
  const summary = normalizePatientSummary(
    bundleWith({
      resource: {
        resourceType: "Observation",
        id: "obs1",
        status: "final",
        category: [{ coding: [{ code: "vital-signs" }] }],
        code: { text: "Blood Pressure" },
        effectiveDateTime: "2026-01-01",
        component: [
          { code: { text: "Systolic" }, valueQuantity: { value: 120, unit: "mmHg" } },
          { code: { text: "Diastolic" }, valueQuantity: { value: 80, unit: "mmHg" } },
        ],
      },
    })
  );
  assert.equal(summary.vitals.length, 1);
  assert.match(summary.vitals[0].value, /120 mmHg/);
  assert.match(summary.vitals[0].value, /80 mmHg/);
});

test("separates labs from vitals by observation category", () => {
  const summary = normalizePatientSummary(
    bundleWith({
      resource: {
        resourceType: "Observation",
        id: "obs2",
        status: "final",
        category: [{ coding: [{ code: "laboratory" }] }],
        code: { text: "Hemoglobin A1c" },
        effectiveDateTime: "2026-01-01",
        valueQuantity: { value: 7.1, unit: "%" },
      },
    })
  );
  assert.equal(summary.vitals.length, 0);
  assert.equal(summary.labs.length, 1);
  assert.equal(summary.labs[0].name, "Hemoglobin A1c");
});
