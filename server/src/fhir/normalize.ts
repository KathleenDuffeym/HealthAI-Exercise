import type {
  AllergyIntoleranceResource,
  ConditionResource,
  FhirBundle,
  ImmunizationResource,
  ObservationResource,
  PersonResource,
} from "./types.js";

export interface PatientSummary {
  patient: { name: string; gender?: string; birthDate?: string; age?: number };
  conditions: Array<{ name: string; status?: string; onset?: string }>;
  allergies: Array<{ name: string; criticality?: string; reaction?: string }>;
  immunizations: Array<{ vaccine: string; date?: string; doseNumber?: number; seriesDoses?: number }>;
  vitals: Array<{ name: string; date?: string; value: string }>;
  labs: Array<{ name: string; date?: string; value: string; referenceRange?: string; flag?: string }>;
}

function displayName(concept?: { coding?: Array<{ display?: string }>; text?: string }): string {
  return concept?.text ?? concept?.coding?.[0]?.display ?? "Unknown";
}

function calculateAge(birthDate?: string, asOf = new Date()): number | undefined {
  if (!birthDate) return undefined;
  const dob = new Date(birthDate);
  let age = asOf.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
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
      name: displayName(a.code),
      criticality: a.criticality,
      reaction: a.reaction?.[0]?.manifestation?.[0]?.text,
    })),
    immunizations: immunizations
      .map((i) => ({
        vaccine: displayName(i.vaccineCode),
        date: i.occurrenceDateTime,
        doseNumber: i.protocolApplied?.[0]?.doseNumberPositiveInt,
        seriesDoses: i.protocolApplied?.[0]?.seriesDosesPositiveInt,
      }))
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    vitals: vitals.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    labs: labs.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
  };
}
