# HealthEx Candidate Exercise — Allison Hackett

Submission for the TSE / Software Developer Intern exercise. Three pieces:

1. [`/server`](server) + [`/web`](web) — a WebUI that fetches a patient's record from the HealthEx FHIR API and displays a clean clinical summary.
2. [`/skills/immunization-gap-check`](skills/immunization-gap-check) — a Claude Skill built on the HealthEx MCP server that finds immunization gaps against the CDC adult schedule and proposes a corrective plan.
3. [`/docs`](docs) — Part 2's written deliverables (technical explainer + customer objection reply).

**AI use disclosure:** this entire submission (code, tests, docs, this README) was built with Claude Code. I directed the architecture, data/rule design, and every tradeoff decision below; Claude wrote the implementation and I reviewed it, including running it live in a browser and running the test suites before writing this section.

## A note on "Allison Hackett" and live API access

The exercise brief suggests using test patient Allison Hackett. I looked for her across every page of `docs.healthex.io` (FHIR server docs, MCP server docs, test-patient docs, the 125-patient sample-patient catalog, demographics/auth docs) and couldn't find that name or an ID for her anywhere — the only example patient ID documented publicly is a generic one (`19cff418-7d80`, "Derrick Lin"). Getting real access also requires a HealthEx org account (API key/secret) for the FHIR path, or a Claude Pro/Max seat plus a HealthEx MCP access code for the skill path — I had neither at hand for this exercise.

Rather than guess at fabricated real IDs or claim to have tested against a live server I couldn't reach, I:

- Built the FHIR client to call the real API when credentials exist (`HEALTHEX_TOKEN` env var), and otherwise fall back to a synthetic patient named Allison Hackett that I constructed to match the exact FHIR R4 resource shapes shown in the docs (`server/src/fixtures/allison-hackett-bundle.json`). The rest of the pipeline — fetch → normalize → render — runs identically either way; only `fetchPatientEverything` branches.
- Designed her record with deliberate immunization gaps (see below) so the gap-checker in Part 1.3 has something real to find, rather than an empty "all good" result.
- Wrote the Claude Skill against the MCP tool contracts and example responses documented at `docs.healthex.io/api-documentation/mcp-server/mcp-tools` and `.../mcp-access`, and unit-tested its core logic standalone — but I was not able to run it against a live MCP connection, and I say so explicitly in the skill's own README section rather than implying otherwise.

If you can share a real API key/secret or an MCP access code, both paths are wired to work as-is — just set `HEALTHEX_TOKEN` in `server/.env` and re-point the skill's tool calls at a live connection.

## Setup & Run

Requires Node 20+.

### 1. Backend API

```bash
cd server
npm install
npm run dev
```

Runs on `http://localhost:3001`. Without a `.env` file (see `.env.example`), it serves the synthetic Allison Hackett fixture. To hit the real HealthEx API instead, copy `.env.example` to `.env` and fill in `HEALTHEX_TOKEN`.

Run its tests: `npm test` (Node's built-in test runner via `tsx`).

### 2. Frontend

```bash
cd web
npm install
npm run dev
```

Opens on `http://localhost:5173` and proxies `/api` to the backend. Loads the patient summary on startup — conditions, allergies, immunizations, and vitals/labs in readable cards, not raw JSON. A small badge marks synthetic vs. live data.

### 3. Immunization gap-check skill

```bash
cd skills/immunization-gap-check
npm install
npm test          # runs the rule-matching unit tests
npm run check -- path/to/input.json   # runs the CLI directly against a JSON input
```

See [`skills/immunization-gap-check/SKILL.md`](skills/immunization-gap-check/SKILL.md) for how Claude is meant to invoke this — it calls the HealthEx MCP tools `get_health_summary` and `get_immunizations`, extracts a structured list from their markdown output, and hands it to this script for deterministic date math and rule matching.

## Data quality issue observed (stretch goal)

Allison's synthetic record — modeled on how real EHR exports typically look — has **no MMR, varicella, or other childhood immunization records at all**, despite being an adult born after 1957 (so she isn't covered by the CDC's presumed-immunity cutoff). This is a very common real-world gap: childhood vaccination records often live on paper at a pediatrician's office that never digitized, or in a state immunization registry the current health system never queried, not because the vaccine was never given.

The skill treats this case as its own status (`verify_history`), distinct from `due_now`, specifically so it doesn't tell a patient "you're missing your MMR shots" when the more likely truth is "your record doesn't have them." In production I'd want HealthEx to:

- Cross-check against state Immunization Information Systems (IIS) before treating a record as authoritative — HealthEx's `update_records` / TEFCA scan (documented in the MCP tools reference) is the right mechanism, just not something a single FHIR pull can substitute for.
- Surface a confidence/provenance field per Immunization resource (was this pulled from a connected EHR, a CCDA import, or self-reported?) so downstream consumers like this skill can calibrate how hard to push a "gap."

## Tradeoffs & decisions

- **TypeScript everywhere**, matching what HealthEx uses in production, with a plain Express backend and a small React (Vite) frontend rather than a meta-framework — the app is one screen with one API call, so Next.js/Remix would be pure overhead here.
- **Synthetic-but-schema-accurate fixture** instead of either (a) hardcoding fake resource types loosely, or (b) blocking the whole exercise on getting HealthEx credentials. I picked accuracy over speed here: every field in the fixture matches the real FHIR shapes shown in the docs, so swapping in a real token requires zero code changes.
- **Deterministic script + LLM extraction split** in the skill, instead of asking the model to do the date math and rule matching itself. MCP tool responses are markdown prose, which an LLM is good at reading, but "how many months since October 2024" and "which rule threshold does 58 cross" are exactly the kind of arithmetic LLMs get subtly wrong under summarization pressure. Splitting it this way makes the recommendation reproducible and testable (9 unit tests on the rule engine), at the cost of an extra process-boundary hop.
- **String/substring matching for vaccine names and risk conditions** (`gapAnalysis.ts`) rather than structured CVX/SNOMED codes. This is the biggest simplification in the whole exercise — real records have far messier vaccine naming than my fixture does. It was the right call for a 2-4 hour exercise; it would not be the right call in production (see below).
- **Only the routine adult schedule**, not the full ACIP schedule (pregnancy, travel, immunocompromised variants, pediatric schedule). Allison is a straightforward adult case; scoping the rule set to match her avoided building CDC-schedule branches I couldn't exercise or test.

## What I'd do differently with more time

- Replace substring vaccine matching with actual CVX code matching (the FHIR docs already show `vaccineCode.coding[].system: "http://hl7.org/fhir/sid/cvx"` — I used the code in the fixture but only matched on display text in the skill, which is the weaker of the two signals I had available).
- Get a real MCP connection (once I have a Pro/Max seat + access code) and re-verify the markdown-parsing assumption in `SKILL.md` step 3 against actual tool output instead of the documented example.
- Add pagination handling to the FHIR client — the docs describe `_count`/`next` links for `$everything`, and my client currently assumes a single page, which is fine for a synthetic 12-resource bundle but wouldn't survive a real patient's full history.
- Show the immunization-gap results inside the WebUI itself (a "check for gaps" button calling the same logic), rather than keeping the two deliverables fully separate — I kept them apart mainly so the two parts of the exercise stayed easy to review independently, but a real patient-facing product would obviously want this in one place.
