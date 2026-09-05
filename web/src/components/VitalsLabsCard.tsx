import type { PatientSummary } from "../types.js";
import { Card, EmptyState, formatDate } from "./Card.js";

export function VitalsLabsCard({
  vitals,
  labs,
}: {
  vitals: PatientSummary["vitals"];
  labs: PatientSummary["labs"];
}) {
  if (vitals.length === 0 && labs.length === 0) {
    return (
      <Card title="Vitals &amp; Labs">
        <EmptyState label="No vitals or labs on record." />
      </Card>
    );
  }

  return (
    <Card title="Vitals &amp; Labs">
      <ul className="list">
        {vitals.map((v) => (
          <li key={`${v.name}-${v.date}`}>
            <div className="list-item-main">
              <span className="list-item-title">{v.name}</span>
              <span>{v.value}</span>
            </div>
            <span className="list-item-meta">{formatDate(v.date)}</span>
          </li>
        ))}
        {labs.map((l) => (
          <li key={`${l.name}-${l.date}`}>
            <div className="list-item-main">
              <span className="list-item-title">{l.name}</span>
              <span>
                {l.value}
                {l.flag && <span className="badge badge-flag">{l.flag}</span>}
              </span>
            </div>
            <span className="list-item-meta">
              {formatDate(l.date)}
              {l.referenceRange && ` · Reference: ${l.referenceRange}`}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
