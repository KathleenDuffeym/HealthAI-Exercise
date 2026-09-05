import { analyzeImmunizationGaps, buildCorrectivePlan, type ImmunizationRecord, type PatientContext } from "./gapAnalysis.js";

/**
 * Usage: tsx cli.ts <input.json>
 * input.json shape: { "immunizations": [{ "vaccine": "...", "date": "YYYY-MM-DD" }], "patient": { "dob": "YYYY-MM-DD", "conditions": ["..."] } }
 *
 * Intended to be invoked by Claude (via the bash/code-execution tool) after
 * Claude has parsed the HealthEx MCP get_immunizations and get_health_summary
 * tool output into this structured shape. Prints { gaps, correctivePlan } as JSON.
 */
async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: tsx cli.ts <input.json>");
    process.exit(1);
  }

  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(inputPath, "utf-8");
  const parsed = JSON.parse(raw) as { immunizations: ImmunizationRecord[]; patient: PatientContext };

  const gaps = analyzeImmunizationGaps(parsed.immunizations, parsed.patient);
  const correctivePlan = buildCorrectivePlan(gaps);

  console.log(JSON.stringify({ gaps, correctivePlan }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
