import { useEffect, useState } from "react";
import { AllergiesCard } from "./components/AllergiesCard.js";
import { ConditionsCard } from "./components/ConditionsCard.js";
import { ImmunizationsCard } from "./components/ImmunizationsCard.js";
import { VitalsLabsCard } from "./components/VitalsLabsCard.js";
import type { SummaryResponse } from "./types.js";

export default function App() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const configRes = await fetch("/api/config");
        const { defaultPatientId } = await configRes.json();

        const summaryRes = await fetch(`/api/patient/${defaultPatientId}/summary`);
        if (!summaryRes.ok) {
          const body = await summaryRes.json();
          throw new Error(body.error ?? "Failed to load patient summary");
        }
        setData(await summaryRes.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }
    load();
  }, []);

  if (error) return <div className="app-shell error-banner">Error: {error}</div>;
  if (!data) return <div className="app-shell">Loading patient record…</div>;

  const { patient, conditions, allergies, immunizations, vitals, labs } = data.summary;

  return (
    <div className="app-shell">
      <header className="patient-header">
        <div>
          <h1>{patient.name}</h1>
          <p className="patient-subline">
            {patient.gender && <span>{patient.gender}</span>}
            {patient.age !== undefined && <span> · {patient.age} years old</span>}
            {patient.birthDate && (
              <span>
                {" "}
                · DOB {new Date(patient.birthDate).toLocaleDateString(undefined, { timeZone: "UTC" })}
              </span>
            )}
          </p>
        </div>
        {data.source === "synthetic-fixture" && (
          <span className="source-badge" title="No HealthEx org credentials were available for this exercise; this record is a synthetic patient built to match the real FHIR R4 response shape.">
            Synthetic demo data
          </span>
        )}
      </header>

      <main className="card-grid">
        <ConditionsCard conditions={conditions} />
        <AllergiesCard allergies={allergies} />
        <ImmunizationsCard immunizations={immunizations} />
        <VitalsLabsCard vitals={vitals} labs={labs} />
      </main>
    </div>
  );
}
