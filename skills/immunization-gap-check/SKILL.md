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
   Active conditions matter here because some vaccines (e.g. pneumococcal,
   meningococcal) are recommended earlier than the general adult age cutoff
   for people with qualifying chronic conditions like diabetes, COPD, asplenia,
   or a complement deficiency.

   Some risk-based rules (meningococcal ACWY, meningococcal B) key off
   occupational or lifestyle risk factors - lab work with meningococcal
   isolates, military service, first-year college dormitory residency - that
   HealthEx's structured clinical data does not reliably capture. There is no
   dedicated "occupation" MCP tool. Before falling back to asking the patient,
   check `get_labs` for LOINC-coded social-history observations (the tool has
   been observed returning things like smoking/alcohol/drug-use history and
   even gender identity this way) - occupation may show up the same way
   (LOINC `11341-5`) if a provider ever recorded it, but usually won't. If
   nothing structured turns up and a meningococcal rule would otherwise read
   `not_yet_applicable` purely for lack of risk-factor data, ask the patient
   directly with a short yes/no list covering exactly the keywords in
   `reference/cdc-adult-schedule.json`'s `riskConditionKeywords` for those two
   rules - this mirrors how a real clinical intake gathers this information,
   rather than guessing from incomplete records. Fold any "yes" answers into
   the same `conditions` array passed to the script in step 4 (see that
   field's JSDoc in `gapAnalysis.ts` - it now holds both structured conditions
   and patient-reported risk factors, matched the same way).

   One clinically important nuance to get right when asking or explaining
   results: general clinical/healthcare employment is **not** itself a
   standard indication for meningococcal B - the real occupational indication
   is specifically for microbiologists/lab personnel *routinely exposed to
   isolated N. meningitidis cultures*, a narrower group. Don't imply "I work
   in a hospital" alone qualifies.

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

- Vaccine matching prefers CVX codes when present, but only 6 of the 11 rules
  (influenza, Tdap/Td, zoster, HPV, meningococcal ACWY, meningococcal B)
  currently carry known CVX codes in `reference/cdc-adult-schedule.json`; the
  rest still rely on substring matching against a small alias list, so unusual
  naming in a real record for those could still be missed.
- The rule set covers the routine adult schedule plus HPV and meningococcal
  ACWY/B, not the full ACIP schedule (e.g. travel vaccines, pregnancy-specific
  timing, or immunocompromised-patient variants are still out of scope).
- HPV always expects a 2-dose series; ACIP actually requires 3 doses when the
  first dose was given at age 15+, which isn't modeled - this can under-flag
  someone who needs a 3rd dose.
- Meningococcal ACWY/B risk-factor matching depends on either structured
  condition data or the patient answering directly (see step 1) - if neither
  happens, a genuinely at-risk patient with no documented risk factor will
  read as `not_yet_applicable` rather than flagged, since the rule can't know
  what it was never told.
- **Verified against a live HealthEx MCP connection** (this section originally
  said it hadn't been - it has been now). That test caught two real gaps
  between the documented example and actual behavior, both now fixed:
  the real response format is a dictionary-compressed columnar format, not
  the markdown table HealthEx's own docs example shows (step 3 above is
  rewritten to match reality); and the real tool returns several duplicate
  rows per actual dose, which `analyzeImmunizationGaps` now dedupes
  internally rather than trusting the extraction step to do it perfectly.
