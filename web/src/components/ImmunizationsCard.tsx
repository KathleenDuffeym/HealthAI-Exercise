import type { PatientSummary } from "../types.js";
import { Card, EmptyState, formatDate } from "./Card.js";

export function ImmunizationsCard({ immunizations }: { immunizations: PatientSummary["immunizations"] }) {
  if (immunizations.length === 0) {
    return (
      <Card title="Immunizations">
        <EmptyState label="No immunizations on record." />
      </Card>
    );
  }

  return (
    <Card title="Immunizations">
      <table className="table">
        <thead>
          <tr>
            <th>Vaccine</th>
            <th>Date</th>
            <th>Dose</th>
          </tr>
        </thead>
        <tbody>
          {immunizations.map((i) => (
            <tr key={`${i.vaccine}-${i.date}`}>
              <td>{i.vaccine}</td>
              <td>{formatDate(i.date)}</td>
              <td>{i.doseNumber ? `${i.doseNumber}${i.seriesDoses ? ` of ${i.seriesDoses}` : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
