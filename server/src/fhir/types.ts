// Minimal structural types for the subset of FHIR R4 this app touches.
// Not a complete FHIR type system - just enough to normalize safely.

export interface FhirBundle {
  resourceType: "Bundle";
  type: string;
  total?: number;
  entry?: Array<{ fullUrl?: string; resource: FhirResource }>;
}

export type FhirResource =
  | PersonResource
  | ConditionResource
  | AllergyIntoleranceResource
  | ImmunizationResource
  | ObservationResource
  | { resourceType: string; [key: string]: unknown };

export interface PersonResource {
  resourceType: "Person";
  id: string;
  name?: Array<{ family?: string; given?: string[]; use?: string }>;
  gender?: string;
  birthDate?: string;
}

export interface CodeableConcept {
  coding?: Array<{ system?: string; code?: string; display?: string }>;
  text?: string;
}

export interface ConditionResource {
  resourceType: "Condition";
  id: string;
  clinicalStatus?: CodeableConcept;
  code?: CodeableConcept;
  onsetDateTime?: string;
  recordedDate?: string;
}

export interface AllergyIntoleranceResource {
  resourceType: "AllergyIntolerance";
  id: string;
  clinicalStatus?: CodeableConcept;
  criticality?: string;
  code?: CodeableConcept;
  onsetDateTime?: string;
  reaction?: Array<{ manifestation?: Array<{ text?: string }>; severity?: string }>;
}

export interface ImmunizationResource {
  resourceType: "Immunization";
  id: string;
  status: string;
  vaccineCode?: CodeableConcept;
  occurrenceDateTime?: string;
  lotNumber?: string;
  site?: { text?: string };
  protocolApplied?: Array<{ doseNumberPositiveInt?: number; seriesDosesPositiveInt?: number }>;
}

export interface ObservationResource {
  resourceType: "Observation";
  id: string;
  status: string;
  category?: Array<CodeableConcept>;
  code?: CodeableConcept;
  effectiveDateTime?: string;
  valueQuantity?: { value?: number; unit?: string };
  referenceRange?: Array<{ text?: string }>;
  interpretation?: Array<{ text?: string }>;
  component?: Array<{ code?: CodeableConcept; valueQuantity?: { value?: number; unit?: string } }>;
}
