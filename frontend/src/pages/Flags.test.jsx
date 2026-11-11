import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockApi, PATIENT, PROFESSIONAL, renderApp } from "../test/renderApp";

const PATIENT_ID = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const recorded_at = "2026-11-10T14:00:00Z";
const highSystolic = {
  direction: "above",
  breached_limit: 139,
  lower_limit: 90,
  upper_limit: 139,
  threshold_source: "default",
};
const lowDiastolic = {
  direction: "below",
  breached_limit: 60,
  lower_limit: 60,
  upper_limit: 89,
  threshold_source: "default",
};
const latest = [
  { vital_type: "systolic", unit: "mmHg", value: 140, recorded_at, available: true, message: null, flag: highSystolic },
  { vital_type: "diastolic", unit: "mmHg", value: 59, recorded_at, available: true, message: null, flag: lowDiastolic },
];
const flags = latest.map((row, index) => ({
  ...row,
  id: index + 1,
  submission_id: "blood-pressure",
  source: "patient_entered",
}));

describe("Automatic reading flags (ALT-2)", () => {
  it("shows each breached blood-pressure component on the patient card and in history", async () => {
    mockApi(PATIENT, { "/readings/latest": latest, "/readings/flags": flags });
    renderApp("/patient");

    const card = await screen.findByRole("region", { name: "Blood pressure" });
    expect(await within(card).findByText("Flagged for review")).toBeInTheDocument();
    expect(within(card).getByText(/Systolic pressure 140 mmHg is above the upper limit of 139 mmHg/)).toBeInTheDocument();
    expect(within(card).getByText(/Diastolic pressure 59 mmHg is below the lower limit of 60 mmHg/)).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Recent flagged readings" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Flags are a monitoring aid, not a diagnosis.")).toBeInTheDocument();
  });

  it("shows an assigned patient's saved flags to their professional", async () => {
    mockApi(PROFESSIONAL, {
      "/professionals/me/patients": [{
        patient_id: PATIENT_ID,
        full_name: "Maya Chen",
        assigned_at: recorded_at,
        dashboard_path: `/professional/patients/${PATIENT_ID}`,
      }],
      [`/patients/${PATIENT_ID}/readings/latest`]: latest,
      [`/patients/${PATIENT_ID}/readings/flags`]: flags,
    });
    renderApp(`/professional/patients/${PATIENT_ID}`);

    expect(await screen.findByRole("heading", { level: 1, name: "Maya Chen" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Recent flagged readings" });
    expect(within(list).getByText(/Systolic pressure 140 mmHg is above the upper limit of 139 mmHg/)).toBeInTheDocument();
    expect(within(list).getByText(/Diastolic pressure 59 mmHg is below the lower limit of 60 mmHg/)).toBeInTheDocument();
  });
});
