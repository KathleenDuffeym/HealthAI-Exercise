import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FhirBundle } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEALTHEX_BASE_URL = process.env.HEALTHEX_BASE_URL ?? "https://api.healthex.io/FHIR/R4";
const HEALTHEX_TOKEN = process.env.HEALTHEX_TOKEN;

export const SYNTHETIC_PATIENT_ID = "synthetic-allison-hackett";

/**
 * Fetches a patient's full record via the HealthEx $everything API.
 *
 * No HealthEx org account was available for this exercise (no API key/secret,
 * and "Allison Hackett" is not an ID documented anywhere on docs.healthex.io -
 * only a generic example ID appears there). If HEALTHEX_TOKEN is set, this hits
 * the real API; otherwise it serves a bundled synthetic fixture built to the
 * same FHIR R4 shapes shown in the docs, so the rest of the app is exercised
 * exactly as it would be against the live server.
 */
export async function fetchPatientEverything(patientId: string): Promise<FhirBundle> {
  if (!HEALTHEX_TOKEN) {
    return loadFixtureBundle(patientId);
  }

  const url = `${HEALTHEX_BASE_URL}/Person/${encodeURIComponent(patientId)}/$everything`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${HEALTHEX_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HealthEx FHIR request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as FhirBundle;
}

function loadFixtureBundle(patientId: string): FhirBundle {
  if (patientId !== SYNTHETIC_PATIENT_ID) {
    throw new Error(
      `No HEALTHEX_TOKEN configured, and no fixture exists for patient "${patientId}". ` +
        `Use patient id "${SYNTHETIC_PATIENT_ID}", or set HEALTHEX_TOKEN + HEALTHEX_BASE_URL to hit the real API.`
    );
  }
  const fixturePath = path.join(__dirname, "..", "fixtures", "allison-hackett-bundle.json");
  const raw = fs.readFileSync(fixturePath, "utf-8");
  return JSON.parse(raw) as FhirBundle;
}

export function isUsingLiveApi(): boolean {
  return Boolean(HEALTHEX_TOKEN);
}
