import cors from "cors";
import express from "express";
import { SYNTHETIC_PATIENT_ID } from "./fhir/client.js";
import { patientRouter } from "./routes/patient.js";

const app = express();
const port = process.env.PORT ?? 3001;

app.use(cors());
app.use("/api/patient", patientRouter);

app.get("/api/config", (_req, res) => {
  res.json({ defaultPatientId: SYNTHETIC_PATIENT_ID });
});

app.listen(port, () => {
  console.log(`HealthEx exercise server listening on http://localhost:${port}`);
});
