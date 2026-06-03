# HealthAI Exercise

This project includes:

- A React + TypeScript web UI that fetches a patient record from the HealthEx FHIR R4 API.
- A reusable Claude system prompt for immunization-gap analysis via MCP (`/claude/health-ex-immunization-skill.prompt.md`).

## Features

- Fetches **Patient**, **Immunization**, and **Condition** resources for a selected patient ID.
- Displays a readable clinical summary with cards and tables (no raw JSON output).
- Handles loading and API errors in the UI.

## API

- Base URL: `https://api.healthex.io/FHIR/R4/`
- FHIR version: R4
- Documentation: <https://docs.healthex.io/fhir-server>

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the repository root:

   ```bash
   VITE_FHIR_BASE_URL=https://api.healthex.io/FHIR/R4
   # Use the exact FHIR id shown for "Allison Hackett" in the HealthEx docs test-patient table.
   VITE_PATIENT_ID=<ALLISON_HACKETT_FHIR_ID>
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open the URL printed by Vite (usually `http://localhost:5173`).

## Available Scripts

- `npm run dev` – start local development server
- `npm run build` – type-check and build for production
- `npm run lint` – run ESLint

## Claude Skill Prompt

Use `claude/health-ex-immunization-skill.prompt.md` as the system prompt for a Claude skill that:

1. Retrieves immunization history from HealthEx MCP/FHIR.
2. Detects CDC guideline gaps.
3. Proposes a catch-up schedule with rationale.
