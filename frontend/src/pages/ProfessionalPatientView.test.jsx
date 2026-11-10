// MON-2: a professional opens one assigned patient and sees their latest readings, trends and flags.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, PROFESSIONAL, renderApp } from "../test/renderApp";

const MAYA = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const DANIEL = "4787dbdd-d66c-4dc8-a034-5521b447f10e";
const entry = (id, name) => ({
  patient_id: id,
  full_name: name,
  assigned_at: "2026-10-01T12:00:00Z",
  dashboard_path: `/professional/patients/${id}`,
});
const ROSTER = [entry(DANIEL, "Daniel Okafor"), entry(MAYA, "Maya Chen")];
const latest = (hr) => [
  { vital_type: "heart_rate", unit: "bpm", value: hr, recorded_at: "2026-11-09T14:00:00Z", available: true, message: null },
];
const history = (...hrs) => ({
  start: "2026-10-11T00:00:00Z",
  end: "2026-11-10T00:00:00Z",
  readings: hrs.map((v, i) => ({
    id: i,
    vital_type: "heart_rate",
    value: v,
    unit: "bpm",
    recorded_at: `2026-11-0${i + 1}T14:00:00Z`,
    submission_id: `s${i}`,
    source: "patient_entered",
  })),
});

const ROUTES = {
  "/professionals/me/patients": ROSTER,
  [`/patients/${MAYA}/readings/latest`]: latest(64),
  [`/patients/${MAYA}/readings/history`]: history(60, 64),
  [`/patients/${DANIEL}/readings/latest`]: latest(91),
  [`/patients/${DANIEL}/readings/history`]: history(88, 95, 91),
};

describe("Individual patient dashboard (MON-2)", () => {
  it("shows the patient's latest readings, trends and flags section", async () => {
    mockApi(PROFESSIONAL, ROUTES);
    renderApp(`/professional/patients/${MAYA}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Maya Chen" })).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Heart rate" });
    expect(within(card).getByText("64")).toBeInTheDocument();
    expect(within(card).getByText("bpm")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Heart rate trend" })).toHaveTextContent(
      "2 readings. Lowest 60, highest 64, average 62 bpm. Latest 64 bpm."
    );
    expect(screen.getByRole("heading", { name: "Flagged readings" })).toBeInTheDocument();
    expect(screen.getByText("Flags are a monitoring aid, not a diagnosis.")).toBeInTheDocument();
  });

  it("updates everything when switching to another patient", async () => {
    const spy = mockApi(PROFESSIONAL, ROUTES);
    const user = userEvent.setup();
    renderApp(`/professional/patients/${MAYA}`);
    await screen.findByRole("region", { name: "Heart rate trend" });

    await user.selectOptions(screen.getByLabelText("Switch patient"), DANIEL);

    expect(await screen.findByRole("heading", { level: 1, name: "Daniel Okafor" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Heart rate trend" })).toHaveTextContent(
      "3 readings. Lowest 88, highest 95, average 91 bpm. Latest 91 bpm."
    );
    expect(within(screen.getByRole("region", { name: "Heart rate" })).getByText("91")).toBeInTheDocument();
    expect(screen.queryByText("64")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Switch patient")).toHaveValue(DANIEL);
    const paths = spy.mock.calls.map(([url]) => new URL(url).pathname);
    expect(paths).toContain(`/patients/${DANIEL}/readings/history`);
  });

  it("keeps an unassigned patient's data hidden", async () => {
    mockApi(PROFESSIONAL, {
      "/professionals/me/patients": ROSTER,
      "/patients/someone-else/readings/latest": [403, { detail: "You do not have access to this patient's records." }],
    });
    renderApp("/professional/patients/someone-else");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn’t assigned to you");
    expect(screen.queryByRole("heading", { name: "Trends" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flagged readings" })).not.toBeInTheDocument();
  });
});
