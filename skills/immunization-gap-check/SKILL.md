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

2. **Pull the full immunization history, and keep paging until it says you're
   done.** Call `get_immunizations` with `{"years": 100}` first. In practice
   the tool paginates in ~3-year windows and its response includes an explicit
   instruction when there's more: a `"More data available: Yes"` flag plus the
   exact next call to make, e.g. `get_immunizations(beforeDate="2023-09-04",
   years=97)`. Keep following that instruction - calling again with the
   `beforeDate`/`years` values it gives you - until a response says the
   requested window is "Fully covered" or omits the "more data available"
   flag. Stopping after one call only gets ~3 years of history; the task asks
   for gaps "from all time," and childhood vaccines matter for adult schedule
   compliance (MMR, varicella), which usually means paging all the way back to
   the patient's date of birth.

3. **Extract a structured list.** The MCP tool's real output is *not*
   markdown - it's a compact, dictionary-compressed columnar format designed
   to save tokens, roughly:

   ```
   #Immunizations 100y|Total:6
   D:1=2026-01-15|2=2020-03-02|
   I:1=Tdap|2=influenza, unspecified formulation|
   S:1=completed|
   Date|Immunization|Status|...|CVX|NDC|SNOMED|PreferredCode|PreferredSystem|...
   @1|@1|@1||...|115|...
   |@2|@1||...||...||88|urn:oid:2.16.840.1.113883.12.292|...
   ```

   Read it like this: the `D:`/`I:`/`S:` lines are per-column dictionaries: an
   `@N` in a data row looks up value `N` from that column's dictionary (so
   `@1` in the `Date` column means `D:1`'s value). An **empty cell in the Date
   column means "same date as the row above."** The real column list is much
   wider than what's shown in HealthEx's own docs example - a dedicated `CVX`
   column exists but is very often empty; when it is, check `PreferredCode`
   paired with `PreferredSystem` - if `PreferredSystem` is
   `urn:oid:2.16.840.1.113883.12.292` or `http://hl7.org/fhir/sid/cvx`, then
   `PreferredCode` **is** the CVX code, just filed under a different column
   name. Use it.

   From this, build a structured array of `{ "vaccine": "<name as written>",
   "date": "YYYY-MM-DD", "cvxCode": "<optional>" }` objects. Keep vaccine
   names close to what the source data used - the matching script checks
   `cvxCode` first when present (exact, reliable match against
   `reference/cdc-adult-schedule.json`'s `cvxCodes`), and falls back to
   substring matching against known aliases otherwise, so include a CVX code
   whenever you can resolve one rather than relying on name matching alone.

   **Expect a lot of duplicate rows for the same real dose** - in testing
   against a live connection, the same administration event routinely appears
   3-6 times in a row (evidently once per connected source system reporting
   it). You don't need to dedupe these yourself: `analyzeImmunizationGaps`
   deduplicates by `(cvxCode ?? vaccine, date)` internally specifically because
   this is real, observed MCP behavior, not a hypothetical - but don't let the
   repetition make you think there are more distinct doses than there are
   when eyeballing the raw output.

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

- Vaccine matching prefers CVX codes when present, but only 3 of the 8 rules
  (influenza, Tdap/Td, zoster) currently carry known CVX codes in
  `reference/cdc-adult-schedule.json`; the rest still rely on substring
  matching against a small alias list, so unusual naming in a real record for
  those could still be missed.
- The rule set covers the routine adult schedule, not the full ACIP schedule
  (e.g. travel vaccines, pregnancy-specific timing, or immunocompromised
  patient variants are out of scope for this demo).
- **Verified against a live HealthEx MCP connection** (this section originally
  said it hadn't been - it has been now). That test caught two real gaps
  between the documented example and actual behavior, both now fixed:
  the real response format is a dictionary-compressed columnar format, not
  the markdown table HealthEx's own docs example shows (step 3 above is
  rewritten to match reality); and the real tool returns several duplicate
  rows per actual dose, which `analyzeImmunizationGaps` now dedupes
  internally rather than trusting the extraction step to do it perfectly.
