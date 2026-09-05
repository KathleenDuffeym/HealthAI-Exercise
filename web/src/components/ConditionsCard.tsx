import type { PatientSummary } from "../types.js";
import { Card, EmptyState, formatDate } from "./Card.js";

export function ConditionsCard({ conditions }: { conditions: PatientSummary["conditions"] }) {
  if (conditions.length === 0) {
    return (
      <Card title="Conditions">
        <EmptyState label="No conditions on record." />
      </Card>
    );
  }

  return (
    <Card title="Conditions">
      <ul className="list">
        {conditions.map((c) => (
          <li key={`${c.name}-${c.onset}`}>
            <div className="list-item-main">
              <span className="list-item-title">{c.name}</span>
              {c.status && <span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span>}
            </div>
            <span className="list-item-meta">Since {formatDate(c.onset)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
