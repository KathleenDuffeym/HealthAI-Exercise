import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchPatientSummary } from './api/fhirClient'
import { HealthSummary } from './components/HealthSummary'
import type { PatientSummary } from './types/fhir'
import './App.css'

const defaultPatientId = (import.meta.env.VITE_PATIENT_ID as string | undefined) ?? ''

function App() {
  const [patientId, setPatientId] = useState(defaultPatientId)
  const [summary, setSummary] = useState<PatientSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canLoad = useMemo(() => patientId.trim().length > 0, [patientId])

  async function loadPatientSummary(targetPatientId: string) {
    setLoading(true)
    setError(null)

    try {
      const result = await fetchPatientSummary(targetPatientId.trim())
      setSummary(result)
    } catch (caughtError) {
      setSummary(null)
      setError(caughtError instanceof Error ? caughtError.message : 'Unexpected error')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (canLoad) {
      void loadPatientSummary(patientId)
    }
  }

  return (
    <>
      <header className="app-header">
        <h1>HealthEx Patient Viewer</h1>
        <p>Fetch and review a patient&apos;s clinical history from the HealthEx FHIR API.</p>
        <form className="patient-form" onSubmit={onSubmit}>
          <label htmlFor="patient-id">Patient ID</label>
          <input
            id="patient-id"
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            placeholder="Enter patient ID"
          />
          <button type="submit" disabled={!canLoad || loading}>
            {loading ? 'Loading…' : 'Load patient'}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </header>

      {summary ? <HealthSummary {...summary} /> : null}
    </>
  )
}

export default App
