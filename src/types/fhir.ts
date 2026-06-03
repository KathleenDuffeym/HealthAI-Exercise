export interface FhirCoding {
  display?: string
}

export interface FhirCodeableConcept {
  text?: string
  coding?: FhirCoding[]
}

export interface FhirPatient {
  id: string
  name?: Array<{
    given?: string[]
    family?: string
  }>
  gender?: string
  birthDate?: string
}

export interface FhirImmunization {
  id: string
  vaccineCode?: FhirCodeableConcept
  occurrenceDateTime?: string
  status?: string
}

export interface FhirCondition {
  id: string
  code?: FhirCodeableConcept
  clinicalStatus?: {
    coding?: Array<{ code?: string }>
  }
  recordedDate?: string
}

export interface FhirBundle<T> {
  entry?: Array<{ resource: T }>
}

export interface PatientSummary {
  patient: FhirPatient
  immunizations: FhirImmunization[]
  conditions: FhirCondition[]
}
