---
name: immunization-gap-check
description: Checks a patient's full immunization history (via the HealthEx MCP server) against the CDC adult immunization schedule, identifies gaps, and proposes a corrective vaccination plan. Use when the user asks about missing vaccines, whether they're up to date on immunizations, or wants a vaccination catch-up plan.
---

# Immunization Gap Check

This skill uses the HealthEx MCP server's clinical-data tools to pull a
patient's complete immunization history and current health context, checks it
against a CDC-based adult immunization schedule, and returns a prioritized,
plain-language corrective plan.

## Prerequisites

The HealthEx MCP server must already be connected in this Claude environment
(Claude Pro/Max with the HealthEx connector, or a test-patient bearer token
passed to `https://api.healthex.io/mcp`). See
`docs.healthex.io/category/healthex-mcp-server` for connection details. This
skill does not set up that connection - it assumes the `get_immunizations`,
`get_health_summary`, and `get_conditions` MCP tools are already callable.

## Steps

1. **Pull health context.** Call the `get_health_summary` tool (no arguments)
   to get the patient's date of birth, age, and current active conditions.
   Active conditions matter here because some vaccines (e.g. pneumococcal) are
   recommended earlier than the general adult age cutoff for people with
   qualifying chronic conditions like diabetes or COPD.

2. **Pull the full immunization history.** Call `get_immunizations` with
   `{"years": 100}` (or another very large number) to get the patient's
   *entire* history, not just the tool's 3-year default - the task asks for
   gaps "from all time," and childhood vaccines matter for adult schedule
   compliance (MMR, varicella).

3. **Extract a structured list.** The MCP tool returns a markdown-formatted
   summary (a prose header plus a table), not JSON. Read that table and
   produce a structured array of `{ "vaccine": "<name as written>", "date":
   "YYYY-MM-DD" }` objects. Keep vaccine names close to what the source data
   used (e.g. "Influenza, injectable, quadrivalent") - the matching script
   does substring matching against known aliases, so minor variation is fine,
   but don't paraphrase into a different vaccine name.

4. **Run the gap-analysis script.** Write the structured immunization list and
   patient context to a temp JSON file shaped like:

   ```json
   {
     "immunizations": [{ "vaccine": "Tdap", "date": "2015-03-10" }],
     "patient": { "dob": "1968-04-12", "conditions": ["Type 2 diabetes mellitus"] }
   }
   ```

   Then run it with the bash/code-execution tool:

   ```bash
   npx tsx scripts/cli.ts /path/to/input.json
   ```

   This prints `{ "gaps": [...], "correctivePlan": [...] }`. The script (not
   the model) does the date math and rule matching, so recommendations are
   deterministic and don't depend on the model doing arithmetic correctly.
   The rule set lives in `reference/cdc-adult-schedule.json` and is summarized
   from the CDC's adult schedule (see `source` field in that file); it is not
   exhaustive or a substitute for clinical judgment.

5. **Present the result in plain language.** Turn the JSON into a short,
   readable summary for the user:
   - Lead with a one-line status ("You're missing 2 routine vaccines and one
     series is incomplete").
   - List each actionable gap with *why* it's flagged (age, condition-based
     eligibility, time-since-last-dose) and what to do.
   - For `verify_history` items (commonly childhood vaccines like MMR/
     varicella), explicitly say the record may simply be missing rather than
     the vaccine never having been given, and recommend confirming with the
     patient or a prior provider rather than presenting it as a confirmed gap.
   - For `shared_decision` items (e.g. COVID-19), frame it as "worth discussing
     with your provider," not a hard requirement.
   - Close with the corrective plan as an ordered list, using the `timing`
     field for urgency framing.
   - Always include: **this is not medical advice; confirm any vaccination
     plan with a licensed clinician.**

## Files

- `scripts/gapAnalysis.ts` - pure rule-matching logic (exported functions:
  `analyzeImmunizationGaps`, `buildCorrectivePlan`).
- `scripts/cli.ts` - CLI wrapper Claude invokes with a JSON input file.
- `scripts/gapAnalysis.test.ts` - unit tests (`npm test` from this directory).
- `reference/cdc-adult-schedule.json` - the simplified rule set and its
  source citation.

## Known limitations (see repo README for full discussion)

- Vaccine matching is substring-based against a small alias list, not
  CVX/SNOMED codes - unusual naming in a real record could be missed.
- The rule set covers the routine adult schedule, not the full ACIP schedule
  (e.g. travel vaccines, pregnancy-specific timing, or immunocompromised
  patient variants are out of scope for this demo).
- This was built and unit-tested without a live HealthEx MCP connection
  (no Claude Pro/Max + HealthEx access code was available for this exercise) -
  step 3's markdown-parsing behavior is based on the documented example
  response shape in `docs.healthex.io/api-documentation/mcp-server/mcp-access`,
  not a live call. It should be re-verified against a real connection before
  production use.
