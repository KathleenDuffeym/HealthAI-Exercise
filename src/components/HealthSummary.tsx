import type { FhirCondition, FhirImmunization, FhirPatient, PatientSummary } from '../types/fhir'
import './HealthSummary.css'

function fullName(patient: FhirPatient): string {
  const primaryName = patient.name?.[0]
  const given = primaryName?.given?.join(' ') ?? ''
  const family = primaryName?.family ?? ''
  return `${given} ${family}`.trim() || 'Unknown Patient'
}

function conceptLabel(text?: string, fallback?: string): string {
  return text || fallback || 'Not available'
}

function immunizationName(immunization: FhirImmunization): string {
  return conceptLabel(
    immunization.vaccineCode?.text,
    immunization.vaccineCode?.coding?.[0]?.display,
  )
}

function conditionName(condition: FhirCondition): string {
  return conceptLabel(condition.code?.text, condition.code?.coding?.[0]?.display)
}

export function HealthSummary({ patient, immunizations, conditions }: PatientSummary) {
  return (
    <main className="health-summary">
      <section className="card">
        <h1>Patient Clinical Summary</h1>
        <dl className="patient-details">
          <div>
            <dt>Name</dt>
            <dd>{fullName(patient)}</dd>
          </div>
          <div>
            <dt>Gender</dt>
            <dd>{patient.gender || 'Not available'}</dd>
          </div>
          <div>
            <dt>Date of Birth</dt>
            <dd>{patient.birthDate || 'Not available'}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Immunization History</h2>
        {immunizations.length === 0 ? (
          <p>No immunizations found for this patient.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vaccine</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {immunizations.map((immunization) => (
                <tr key={immunization.id}>
                  <td>{immunizationName(immunization)}</td>
                  <td>{immunization.occurrenceDateTime || 'Not available'}</td>
                  <td>{immunization.status || 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Condition History</h2>
        {conditions.length === 0 ? (
          <p>No conditions found for this patient.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Condition</th>
                <th>Recorded Date</th>
                <th>Clinical Status</th>
              </tr>
            </thead>
            <tbody>
              {conditions.map((condition) => (
                <tr key={condition.id}>
                  <td>{conditionName(condition)}</td>
                  <td>{condition.recordedDate || 'Not available'}</td>
                  <td>{condition.clinicalStatus?.coding?.[0]?.code || 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
