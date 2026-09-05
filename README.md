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
- Wrote the Claude Skill against the MCP tool contracts and example responses documented at `docs.healthex.io/api-documentation/mcp-server/mcp-tools` and `.../mcp-access`, and unit-tested its core logic standalone.

**Update: since first writing this, I connected the HealthEx connector to my own Claude account and ran the skill live against my own real connected health records** (the FHIR/WebUI path still runs on the synthetic fixture above, since I never did get org API credentials for that path). That live test caught two real gaps between HealthEx's documented example and actual behavior — both are now fixed and covered by regression tests, see "Data quality issues observed" below. I did not commit any of my real health data anywhere in this repo; only the two structural bugs it exposed.

If you can share a real API key/secret for the FHIR path, it's wired to work as-is — just set `HEALTHEX_TOKEN` in `server/.env`.

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

See [`skills/immunization-gap-check/SKILL.md`](skills/immunization-gap-check/SKILL.md) for how Claude is meant to invoke this — it calls the HealthEx MCP tools `get_health_summary` and `get_immunizations`, extracts a structured list from their (real format, not markdown — see SKILL.md) output, and hands it to this script for deterministic date math and rule matching. This has now been run live against a real HealthEx MCP connection, not just unit-tested in isolation.

## Data quality issues observed (stretch goal)

**1. Missing childhood records aren't the same as missing vaccinations.** Allison's synthetic record — modeled on how real EHR exports typically look — has no MMR, varicella, or other childhood immunization records at all, despite being an adult born after 1957 (so she isn't covered by the CDC's presumed-immunity cutoff). This is a very common real-world gap: childhood vaccination records often live on paper at a pediatrician's office that never digitized, or in a state immunization registry the current health system never queried, not because the vaccine was never given.

The skill treats this case as its own status (`verify_history`), distinct from `due_now`, specifically so it doesn't tell a patient "you're missing your MMR shots" when the more likely truth is "your record doesn't have them."

**2. Confirmed live: the same real dose gets reported multiple times.** When I ran the skill against my own real HealthEx-connected data, `get_immunizations` returned the *same* administration event 3-6 times in a row — evidently once per connected source system reporting it (e.g. a hospital EHR and a pharmacy feed both reporting the same flu shot). Before I caught this, `analyzeImmunizationGaps`'s dose-counting for series/verify-history rules (MMR, varicella, Shingrix, Hepatitis B) would have silently overcounted — 6 duplicate rows of the same MMR dose would read as "6 doses given," masking a real incomplete series instead of flagging it. Fixed by deduplicating on `(cvxCode ?? vaccine, date)` inside `analyzeImmunizationGaps` itself (`skills/immunization-gap-check/scripts/gapAnalysis.ts`) rather than trusting the LLM extraction step to always dedupe correctly — see the regression test in `gapAnalysis.test.ts` that reproduces this with 4 duplicate rows of one dose.

**3. Occupational/lifestyle risk factors aren't in structured clinical data at all.** Extending the rule set to meningococcal ACWY/B (see below) meant needing to know things like "does this patient work in a lab handling meningococcal isolates" or "do they live in a college dorm" — and there's no `get_occupation` MCP tool, and no reliable structured field for it. The closest thing is LOINC-coded social-history observations, which `get_labs` does return for some fields (smoking/alcohol/drug-use history, gender identity showed up this way in testing) — occupation could theoretically show up the same way (LOINC `11341-5`) but usually won't. SKILL.md now instructs Claude to check for that first, then ask the patient directly for the small set of yes/no risk factors these two rules need — which is exactly how a real clinical intake gathers this, rather than pretending the EHR has better data than it does.

In production I'd want HealthEx to:

- Cross-check against state Immunization Information Systems (IIS) before treating a record as authoritative — HealthEx's `update_records` / TEFCA scan (documented in the MCP tools reference) is the right mechanism, just not something a single FHIR pull can substitute for.
- Surface a confidence/provenance field per Immunization resource (was this pulled from a connected EHR, a CCDA import, or self-reported?) so downstream consumers like this skill can calibrate how hard to push a "gap."
- De-duplicate multi-source records server-side (in the MCP tool itself), rather than leaving every consumer of `get_immunizations` to discover and handle this independently.
- Add a structured, patient-editable "risk factors / exposures" field to the health record — right now anything not captured as a formal Condition (occupation, living situation, travel) is invisible to every downstream consumer, not just this skill.

## Tradeoffs & decisions

- **TypeScript everywhere**, matching what HealthEx uses in production, with a plain Express backend and a small React (Vite) frontend rather than a meta-framework — the app is one screen with one API call, so Next.js/Remix would be pure overhead here.
- **Synthetic-but-schema-accurate fixture** instead of either (a) hardcoding fake resource types loosely, or (b) blocking the whole exercise on getting HealthEx credentials. I picked accuracy over speed here: every field in the fixture matches the real FHIR shapes shown in the docs, so swapping in a real token requires zero code changes.
- **Deterministic script + LLM extraction split** in the skill, instead of asking the model to do the date math and rule matching itself. MCP tool responses are markdown prose, which an LLM is good at reading, but "how many months since October 2024" and "which rule threshold does 58 cross" are exactly the kind of arithmetic LLMs get subtly wrong under summarization pressure. Splitting it this way makes the recommendation reproducible and testable (9 unit tests on the rule engine), at the cost of an extra process-boundary hop.
- **CVX-code matching where available, substring matching as fallback** (`gapAnalysis.ts`) rather than pure string matching. 6 of the 11 CDC rules (influenza, Tdap/Td, zoster, HPV, meningococcal ACWY, meningococcal B) have known CVX codes populated in `reference/cdc-adult-schedule.json`; the rest still rely on substring aliases. Real vaccine naming turned out to be messier than my fixture even accounted for (e.g. "Pfizer SARS-CoV-2 Vaccine 12+ Yrs (Purple Cap)" as a display name, from live testing) — exactly the case CVX matching is meant to handle instead of guessing at every possible brand name string.
- **Mostly the routine adult schedule, plus HPV and meningococcal ACWY/B** (added after initially scoping to only routine vaccines), not the full ACIP schedule (pregnancy, travel, immunocompromised variants, pediatric schedule). The two meningococcal rules reuse the exact same age+risk-condition matching mechanism already built for pneumococcal rather than adding a special case — the only new concept they needed was accepting patient-reported risk factors (occupation, living situation) into the same `conditions` array structured EHR conditions already flow through, documented in `PatientContext`'s JSDoc.
- **HPV always expects 2 doses**, not the age-dependent 2-or-3-dose ACIP rule (3 doses when the first dose is given at 15+). A known simplification, documented in SKILL.md and the rule's own `notes` field, that can under-flag someone who actually needs a 3rd dose.

## What I'd do differently with more time

- Extend CVX-code matching to the remaining 5 CDC rules (pneumococcal, Hepatitis B, COVID-19, MMR, varicella) — I only populated codes for the rules I could verify against fixture/live data directly; the rest still lean on substring aliases.
- Model HPV's actual age-dependent dose count (2 doses if started before 15, 3 if started at 15+) instead of always requiring 2.
- Build an actual risk-factor questionnaire step into the skill flow (rather than an ad-hoc "ask if needed" instruction in SKILL.md) for the meningococcal rules, so the yes/no risk-factor questions are asked consistently instead of depending on the model noticing they're needed.
- Add pagination handling to the FHIR **client** (`server/src/fhir/client.ts`) the same way the MCP skill now handles it — the docs describe `_count`/`next` links for `$everything`, and the client currently assumes a single page, which is fine for a synthetic 12-resource bundle but wouldn't survive a real patient's full history. (The MCP path already had to solve this for real, since `get_immunizations` paginates in ~3-year windows — see SKILL.md step 2.)
- Get real HealthEx org API credentials and re-run the same live-validation pass against the FHIR/WebUI path that I was able to do for the MCP skill path — right now only one of the two integration paths has been proven against a real server.
- Show the immunization-gap results inside the WebUI itself (a "check for gaps" button calling the same logic), rather than keeping the two deliverables fully separate — I kept them apart mainly so the two parts of the exercise stayed easy to review independently, but a real patient-facing product would obviously want this in one place.
