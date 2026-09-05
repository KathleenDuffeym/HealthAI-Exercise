// Single source of truth for the shape server/src/fhir/normalize.ts produces
// and web/src/types.ts consumes. Both packages import from here (type-only,
// so it erases at build time and adds no runtime/bundling dependency) instead
// of hand-duplicating the interface on each side of the network boundary.
export interface PatientSummary {
  patient: { name: string; gender?: string; birthDate?: string; age?: number };
  conditions: Array<{ name: string; status?: string; onset?: string }>;
  allergies: Array<{ id?: string; name: string; status?: string; criticality?: string; reaction?: string }>;
  immunizations: Array<{
    vaccine: string;
    date?: string;
    doseNumber?: number;
    seriesDoses?: number;
    cvxCode?: string;
  }>;
  vitals: Array<{ name: string; date?: string; value: string }>;
  labs: Array<{ name: string; date?: string; value: string; referenceRange?: string; flag?: string }>;
}

export interface SummaryResponse {
  summary: PatientSummary;
  source: "live" | "synthetic-fixture";
}
