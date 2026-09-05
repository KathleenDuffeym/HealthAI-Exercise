import { Router } from "express";
import { fetchPatientEverything, isUsingLiveApi } from "../fhir/client.js";
import { normalizePatientSummary } from "../fhir/normalize.js";

export const patientRouter = Router();

patientRouter.get("/:patientId/summary", async (req, res) => {
  try {
    const bundle = await fetchPatientEverything(req.params.patientId);
    const summary = normalizePatientSummary(bundle);
    res.json({ summary, source: isUsingLiveApi() ? "live" : "synthetic-fixture" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});
