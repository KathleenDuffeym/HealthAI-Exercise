import type { ReactNode } from "react";

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function EmptyState({ label }: { label: string }) {
  return <p className="empty-state">{label}</p>;
}

export function formatDate(date?: string): string {
  if (!date) return "Unknown date";
  // Render in UTC so date-only values (e.g. "2021-11-19") don't shift a day
  // backward for viewers west of UTC, since `new Date("YYYY-MM-DD")` parses
  // as UTC midnight.
  return new Date(date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
