import type {
  FhirBundle,
  FhirCondition,
  FhirImmunization,
  FhirPatient,
  PatientSummary,
} from '../types/fhir'

const FHIR_BASE_URL =
  (import.meta.env.VITE_FHIR_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.healthex.io/FHIR/R4'

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${FHIR_BASE_URL}/${path}`, {
    headers: {
      Accept: 'application/fhir+json',
    },
  })

  if (!response.ok) {
    throw new Error(`FHIR request failed (${response.status})`) 
  }

  return (await response.json()) as T
}

function fromBundle<T>(bundle: FhirBundle<T>): T[] {
  return bundle.entry?.map((entry) => entry.resource) ?? []
}

export async function fetchPatientSummary(patientId: string): Promise<PatientSummary> {
  const [patient, immunizationBundle, conditionBundle] = await Promise.all([
    request<FhirPatient>(`Patient/${encodeURIComponent(patientId)}`),
    request<FhirBundle<FhirImmunization>>(
      `Immunization?patient=${encodeURIComponent(patientId)}&_sort=-date`,
    ),
    request<FhirBundle<FhirCondition>>(
      `Condition?patient=${encodeURIComponent(patientId)}&_sort=-recorded-date`,
    ),
  ])

  return {
    patient,
    immunizations: fromBundle(immunizationBundle),
    conditions: fromBundle(conditionBundle),
  }
}
