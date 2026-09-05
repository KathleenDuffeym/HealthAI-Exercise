export interface PatientSummary {
  patient: { name: string; gender?: string; birthDate?: string; age?: number };
  conditions: Array<{ name: string; status?: string; onset?: string }>;
  allergies: Array<{ name: string; criticality?: string; reaction?: string }>;
  immunizations: Array<{ vaccine: string; date?: string; doseNumber?: number; seriesDoses?: number }>;
  vitals: Array<{ name: string; date?: string; value: string }>;
  labs: Array<{ name: string; date?: string; value: string; referenceRange?: string; flag?: string }>;
}

export interface SummaryResponse {
  summary: PatientSummary;
  source: "live" | "synthetic-fixture";
}
