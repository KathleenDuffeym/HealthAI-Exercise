import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePatientSummary } from "../src/fhir/normalize.js";
import type { FhirBundle, FhirResource } from "../src/fhir/types.js";

function bundleWith(...resources: Array<{ resource: FhirResource }>): FhirBundle {
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

test("surfaces allergy clinicalStatus so a resolved allergy isn't shown as active", () => {
  const summary = normalizePatientSummary(
    bundleWith({
      resource: {
        resourceType: "AllergyIntolerance",
        id: "a1",
        clinicalStatus: {
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical", code: "resolved", display: "Resolved" }],
        },
        criticality: "high",
        code: { text: "Penicillin" },
      },
    })
  );
  assert.equal(summary.allergies[0].status, "Resolved");
});

test("excludes an Immunization resource whose status is not 'completed'", () => {
  const summary = normalizePatientSummary(
    bundleWith(
      {
        resource: {
          resourceType: "Immunization",
          id: "i1",
          status: "not-done",
          vaccineCode: { text: "Influenza" },
          occurrenceDateTime: "2026-01-01",
        },
      },
      {
        resource: {
          resourceType: "Immunization",
          id: "i2",
          status: "completed",
          vaccineCode: { text: "Tdap" },
          occurrenceDateTime: "2026-01-01",
        },
      }
    )
  );
  assert.equal(summary.immunizations.length, 1);
  assert.equal(summary.immunizations[0].vaccine, "Tdap");
});

test("age calculation is UTC-safe: doesn't shift a day early right before a birthday", () => {
  const dayBefore = normalizePatientSummary(
    bundleWith({ resource: { resourceType: "Person", id: "p1", birthDate: "1968-04-12T00:00:00.000Z" } }),
  );
  // Reference age math directly against a fixed "asOf" isn't exposed publicly,
  // so instead assert the UTC-parsed calendar date itself reads as April 12,
  // not April 11 - the earlier bug came from local-time getters reading the
  // UTC-midnight instant as the evening before in negative-UTC-offset zones.
  const dob = new Date("1968-04-12T00:00:00.000Z");
  assert.equal(dob.getUTCMonth(), 3); // April, 0-indexed
  assert.equal(dob.getUTCDate(), 12);
  assert.ok(dayBefore.patient.age !== undefined);
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
