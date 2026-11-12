// MON-1-T2: roster entries link to the correct patient dashboard; assignments and empty states.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, PATIENT, PROFESSIONAL, renderApp } from "../test/renderApp";

const MAYA = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const DANIEL = "4787dbdd-d66c-4dc8-a034-5521b447f10e";
const NONE = ["heart_rate", "systolic", "diastolic", "temperature", "spo2"].map((vital_type) => ({
  vital_type, unit: "", value: null, recorded_at: null, available: false, message: "No reading available",
}));
const entry = (id, name, latest = NONE) => ({
  patient_id: id,
  full_name: name,
  assigned_at: "2026-10-01T12:00:00Z",
  dashboard_path: `/professional/patients/${id}`,
  latest,
});
const ROSTER = [entry(DANIEL, "Daniel Okafor"), entry(MAYA, "Maya Chen")];
const MAYA_LATEST = [
  { vital_type: "heart_rate", unit: "bpm", value: 64, recorded_at: "2026-10-29T14:00:00Z", available: true, message: null },
];

describe("Professional roster (MON-1)", () => {
  it("shows the assigned patients, each linking to their dashboard", async () => {
    mockApi(PROFESSIONAL, { "/professionals/me/patients": ROSTER });
    renderApp("/professional");
    const table = within(await screen.findByRole("table", { name: "Assigned patients" }));
    const links = table.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Open Daniel Okafor", "Open Maya Chen"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      `/professional/patients/${DANIEL}`,
      `/professional/patients/${MAYA}`,
    ]);
  });

  it("shows the patient count, last reading and latest vitals for each patient", async () => {
    const latest = [
      { vital_type: "heart_rate", unit: "bpm", value: 72, recorded_at: "2026-10-29T14:00:00Z", available: true, message: null },
      { vital_type: "systolic", unit: "mmHg", value: 128, recorded_at: "2026-10-29T14:00:00Z", available: true, message: null },
      { vital_type: "diastolic", unit: "mmHg", value: 82, recorded_at: "2026-10-29T14:00:00Z", available: true, message: null },
      { vital_type: "temperature", unit: "°C", value: 36.8, recorded_at: "2026-10-28T14:00:00Z", available: true, message: null },
      { vital_type: "spo2", unit: "%", value: null, recorded_at: null, available: false, message: "No reading available" },
    ];
    mockApi(PROFESSIONAL, { "/professionals/me/patients": [entry(DANIEL, "Daniel Okafor"), entry(MAYA, "Maya Chen", latest)] });
    renderApp("/professional");
    expect(await screen.findByText("2 patients are assigned to you. Select a patient to review their readings.")).toBeInTheDocument();
    const [, daniel, maya] = screen.getAllByRole("row");
    expect(within(maya).getByText("HR 72 · BP 128/82 · 36.8 °C")).toBeInTheDocument();
    expect(within(maya).getByText(/Oct 29/)).toBeInTheDocument();
    expect(within(daniel).getByText("No readings yet")).toBeInTheDocument();
  });

  it("filters the roster by name", async () => {
    mockApi(PROFESSIONAL, { "/professionals/me/patients": ROSTER });
    const user = userEvent.setup();
    renderApp("/professional");
    await user.type(await screen.findByLabelText("Search patients by name"), "may");
    const table = within(screen.getByRole("table", { name: "Assigned patients" }));
    expect(table.getAllByRole("link").map((a) => a.getAttribute("aria-label"))).toEqual(["Open Maya Chen"]);
    await user.clear(screen.getByLabelText("Search patients by name"));
    await user.type(screen.getByLabelText("Search patients by name"), "zzz");
    expect(screen.getByText("No patients match “zzz”.")).toBeInTheDocument();
  });

  it("shows an empty state when no patients are assigned", async () => {
    mockApi(PROFESSIONAL, { "/professionals/me/patients": [] });
    renderApp("/professional");
    expect(await screen.findByText("No patients assigned yet")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Assigned patients" })).not.toBeInTheDocument();
  });

  it("shows a loading state first", async () => {
    mockApi(PROFESSIONAL, { "/professionals/me/patients": ROSTER });
    renderApp("/professional");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading patients");
  });

  it("opens the selected patient's dashboard with their readings", async () => {
    mockApi(PROFESSIONAL, {
      "/professionals/me/patients": ROSTER,
      [`/patients/${MAYA}/readings/latest`]: MAYA_LATEST,
    });
    const user = userEvent.setup();
    renderApp("/professional");
    await user.click(await screen.findByRole("link", { name: "Open Maya Chen" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Maya Chen" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Heart rate" })).getByText("64")).toBeInTheDocument();
  });

  it("explains when a professional opens an unassigned patient's URL directly", async () => {
    mockApi(PROFESSIONAL, {
      "/professionals/me/patients": ROSTER,
      "/patients/someone-else/readings/latest": [403, { detail: "You do not have access to this patient's records." }],
    });
    renderApp("/professional/patients/someone-else");
    expect(await screen.findByRole("alert")).toHaveTextContent("isn’t assigned to you");
  });

  it("shows a retry option when the roster fails to load", async () => {
    mockApi(PROFESSIONAL, { "/professionals/me/patients": [500, { detail: "Server error" }] });
    renderApp("/professional");
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your patients");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps patients out of the professional pages", async () => {
    mockApi(PATIENT);
    renderApp("/professional");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/Good (morning|afternoon|evening), Maya/);
  });
});
