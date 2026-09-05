import type { PatientSummary } from "../types.js";
import { Card, EmptyState } from "./Card.js";

export function AllergiesCard({ allergies }: { allergies: PatientSummary["allergies"] }) {
  if (allergies.length === 0) {
    return (
      <Card title="Allergies">
        <EmptyState label="No known allergies." />
      </Card>
    );
  }

  return (
    <Card title="Allergies">
      <ul className="list">
        {allergies.map((a) => (
          <li key={a.id ?? `${a.name}-${a.reaction ?? ""}`}>
            <div className="list-item-main">
              <span className="list-item-title">{a.name}</span>
              {a.criticality && (
                <span className={`badge badge-criticality-${a.criticality}`}>{a.criticality}</span>
              )}
            </div>
            <span className="list-item-meta">
              {a.reaction && `Reaction: ${a.reaction}`}
              {a.status && a.status.toLowerCase() !== "active" && (
                <span className="badge" style={{ marginLeft: "0.5rem" }}>
                  {a.status}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
