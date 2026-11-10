// TR_REP-1: a patient picks a time period and sees trends for each vital sign.
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { periodParams, presetRange } from "../lib/trends";
import { mockApi, PATIENT, renderApp } from "../test/renderApp";

const r = (vital_type, value, recorded_at, submission_id = recorded_at) => ({
  id: Math.random(),
  vital_type,
  value,
  unit: { heart_rate: "bpm", systolic: "mmHg", diastolic: "mmHg", temperature: "°C", spo2: "%" }[vital_type],
  recorded_at,
  submission_id,
  source: "patient_entered",
});
const HISTORY = {
  start: "2026-10-12T04:00:00Z",
  end: "2026-11-11T04:59:59Z",
  readings: [
    r("heart_rate", 70, "2026-11-01T13:00:00Z", "a"),
    r("systolic", 120, "2026-11-01T13:00:00Z", "a"),
    r("diastolic", 80, "2026-11-01T13:00:00Z", "a"),
    r("heart_rate", 80, "2026-11-02T13:00:00Z", "b"),
  ],
};

const historyCalls = (spy) =>
  spy.mock.calls.map(([url]) => new URL(url)).filter((u) => u.pathname === "/readings/history");
const params = (u) => ({ start: u.searchParams.get("start"), end: u.searchParams.get("end") });

async function openTrends(history = HISTORY) {
  const spy = mockApi(PATIENT, { "/readings/history": history });
  renderApp("/patient/trends");
  await screen.findByRole("heading", { level: 1, name: "Trends & history" });
  return spy;
}

describe("Trends page (TR_REP-1)", () => {
  it("shows a summary for each vital in the period", async () => {
    await openTrends();
    const hr = await screen.findByRole("region", { name: "Heart rate trend" });
    expect(hr).toHaveTextContent("2 readings. Lowest 70, highest 80, average 75 bpm. Latest 80 bpm.");
    expect(screen.getByRole("region", { name: "Blood pressure trend" })).toHaveTextContent("Systolic: 1 reading");
    expect(screen.getByRole("region", { name: "Oxygen saturation trend" })).toHaveTextContent(
      "No oxygen saturation readings in this period."
    );
  });

  it("asks for the last 30 days by default, with both days included", async () => {
    const spy = await openTrends();
    await screen.findByRole("region", { name: "Heart rate trend" });
    const { from, to } = presetRange(30);
    expect(params(historyCalls(spy)[0])).toEqual(periodParams(from, to));
    expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("refetches when a preset is chosen", async () => {
    const spy = await openTrends();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Last 7 days" }));
    await screen.findByRole("region", { name: "Heart rate trend" });
    const { from, to } = presetRange(7);
    expect(params(historyCalls(spy).at(-1))).toEqual(periodParams(from, to));
    expect(screen.getByRole("button", { name: "Last 7 days" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a custom period, including the whole end day", async () => {
    const spy = await openTrends();
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-07" } });
    await user.click(screen.getByRole("button", { name: "Show period" }));
    await screen.findByRole("region", { name: "Heart rate trend" });
    expect(params(historyCalls(spy).at(-1))).toEqual({
      start: new Date(2026, 10, 1).toISOString(),
      end: new Date(2026, 10, 7, 23, 59, 59, 999).toISOString(),
    });
    expect(screen.getByText(/Showing Nov 1, 2026 – Nov 7, 2026/)).toBeInTheDocument();
  });

  it("blocks a start date after the end date without asking the server", async () => {
    const spy = await openTrends();
    await screen.findByRole("region", { name: "Heart rate trend" });
    const before = historyCalls(spy).length;
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-01" } });
    await user.click(screen.getByRole("button", { name: "Show period" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The start date must be on or before the end date.");
    expect(historyCalls(spy)).toHaveLength(before);
  });

  it("explains when there are no readings in the period", async () => {
    await openTrends({ ...HISTORY, readings: [] });
    expect(await screen.findByText("No readings in this period")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Heart rate trend" })).not.toBeInTheDocument();
  });

  it("shows the server's plain-language error for a rejected period", async () => {
    await openTrends([422, { errors: [{ field: null, message: "Choose a time period of 366 days or less." }] }]);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Choose a time period of 366 days or less.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
