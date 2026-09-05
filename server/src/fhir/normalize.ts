import type { PatientSummary } from "../../../shared/patient-summary.js";
import type {
  AllergyIntoleranceResource,
  ConditionResource,
  FhirBundle,
  ImmunizationResource,
  ObservationResource,
  PersonResource,
} from "./types.js";

export type { PatientSummary };

function displayName(concept?: { coding?: Array<{ display?: string }>; text?: string }): string {
  return concept?.text ?? concept?.coding?.[0]?.display ?? "Unknown";
}

function cvxCode(concept?: { coding?: Array<{ system?: string; code?: string }> }): string | undefined {
  return concept?.coding?.find((c) => c.system?.includes("cvx"))?.code;
}

function calculateAge(birthDate?: string, asOf = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return undefined;
  // Read both dates with UTC getters: birthDate is a FHIR date-only value
  // that parses as UTC midnight, so comparing it against local-time getters
  // shifts the calendar date back a day in any timezone west of UTC.
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const hasHadBirthdayThisYear =
    asOf.getUTCMonth() > dob.getUTCMonth() ||
    (asOf.getUTCMonth() === dob.getUTCMonth() && asOf.getUTCDate() >= dob.getUTCDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

export function normalizePatientSummary(bundle: FhirBundle): PatientSummary {
  const resources = (bundle.entry ?? []).map((e) => e.resource);

  const person = resources.find((r) => r.resourceType === "Person") as PersonResource | undefined;
  const conditions = resources.filter((r) => r.resourceType === "Condition") as ConditionResource[];
  const allergies = resources.filter(
    (r) => r.resourceType === "AllergyIntolerance"
  ) as AllergyIntoleranceResource[];
  const immunizations = resources.filter(
    (r) => r.resourceType === "Immunization"
  ) as ImmunizationResource[];
  const observations = resources.filter(
    (r) => r.resourceType === "Observation"
  ) as ObservationResource[];

  const name = person?.name?.[0]
    ? [person.name[0].given?.join(" "), person.name[0].family].filter(Boolean).join(" ")
    : "Unknown Patient";

  const vitals: PatientSummary["vitals"] = [];
  const labs: PatientSummary["labs"] = [];

  for (const obs of observations) {
    const isVital = obs.category?.some((c) => c.coding?.some((code) => code.code === "vital-signs"));
    const name = displayName(obs.code);

    if (obs.component?.length) {
      // Multi-component observation (e.g. blood pressure systolic/diastolic)
      const value = obs.component
        .map((c) => `${displayName(c.code)}: ${c.valueQuantity?.value ?? "?"} ${c.valueQuantity?.unit ?? ""}`.trim())
        .join(", ");
      if (isVital) {
        vitals.push({ name, date: obs.effectiveDateTime, value });
      } else {
        labs.push({ name, date: obs.effectiveDateTime, value });
      }
      continue;
    }

    const value = `${obs.valueQuantity?.value ?? "?"} ${obs.valueQuantity?.unit ?? ""}`.trim();
    if (isVital) {
      vitals.push({ name, date: obs.effectiveDateTime, value });
    } else {
      labs.push({
        name,
        date: obs.effectiveDateTime,
        value,
        referenceRange: obs.referenceRange?.[0]?.text,
        flag: obs.interpretation?.[0]?.text,
      });
    }
  }

  return {
    patient: {
      name,
      gender: person?.gender,
      birthDate: person?.birthDate,
      age: calculateAge(person?.birthDate),
    },
    conditions: conditions
      .map((c) => ({
        name: displayName(c.code),
        status: c.clinicalStatus?.coding?.[0]?.display ?? c.clinicalStatus?.text,
        onset: c.onsetDateTime ?? c.recordedDate,
      }))
      .sort((a, b) => (b.onset ?? "").localeCompare(a.onset ?? "")),
    allergies: allergies.map((a) => ({
      id: a.id,
      name: displayName(a.code),
      status: a.clinicalStatus?.coding?.[0]?.display ?? a.clinicalStatus?.text,
      criticality: a.criticality,
      reaction: a.reaction?.[0]?.manifestation?.[0]?.text,
    })),
    // FHIR Immunization.status can be "not-done" or "entered-in-error" -
    // those mean the vaccine was NOT administered, so only "completed"
    // records should ever be shown or counted as a real dose.
    immunizations: immunizations
      .filter((i) => i.status === "completed")
      .map((i) => ({
        vaccine: displayName(i.vaccineCode),
        date: i.occurrenceDateTime,
        doseNumber: i.protocolApplied?.[0]?.doseNumberPositiveInt,
        seriesDoses: i.protocolApplied?.[0]?.seriesDosesPositiveInt,
        cvxCode: cvxCode(i.vaccineCode),
      }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    vitals: vitals.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    labs: labs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
  };
}
