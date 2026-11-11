import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PROFESSIONAL, renderApp } from "../test/renderApp";

const MAYA = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const DANIEL = "4787dbdd-d66c-4dc8-a034-5521b447f10e";
const at = "2026-11-10T14:00:00Z";
const alerts = [
  { id: "e23adbc1-a3ae-4a84-b1ae-3e27bd4f3348", patient_id: MAYA, patient_name: "Maya Chen",
    vital_type: "heart_rate", value: 101, unit: "bpm", recorded_at: at,
    direction: "above", breached_limit: 100, lower_limit: 60, upper_limit: 100,
    threshold_source: "default", reviewed_at: null },
  { id: "72a8065e-bc32-4ba1-8913-80c18c7add0a", patient_id: DANIEL, patient_name: "Daniel Okafor",
    vital_type: "spo2", value: 94, unit: "%", recorded_at: at,
    direction: "below", breached_limit: 95, lower_limit: 95, upper_limit: 100,
    threshold_source: "default", reviewed_at: null },
];
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

describe("Professional alert review (ALT-1)", () => {
  it("filters alerts, reviews one, updates the count, and retains reviewed history", async () => {
    const saved = alerts.map((item) => ({ ...item }));
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
      const request = new URL(url);
      if (request.pathname === "/auth/me") return json(200, PROFESSIONAL);
      if (request.pathname === "/professionals/me/patients") return json(200, [
        { patient_id: MAYA, full_name: "Maya Chen" },
        { patient_id: DANIEL, full_name: "Daniel Okafor" },
      ]);
      if (request.pathname === "/professionals/me/alerts/count")
        return json(200, { unreviewed_count: saved.filter((item) => !item.reviewed_at).length });
      if (request.pathname === "/professionals/me/alerts") {
        const patient = request.searchParams.get("patient_id");
        const status = request.searchParams.get("status");
        const matching = saved.filter((item) => (!patient || item.patient_id === patient)
          && (status === "all" || (status === "reviewed") === Boolean(item.reviewed_at)));
        return json(200, { unreviewed_count: saved.filter((item) => !item.reviewed_at).length, alerts: matching });
      }
      if (options.method === "PATCH" && request.pathname.endsWith("/review")) {
        const item = saved.find((row) => request.pathname.includes(row.id));
        item.reviewed_at = at;
        return json(200, { id: item.id, reviewed_at: at });
      }
      return json(404, { detail: "Not found" });
    });
    const user = userEvent.setup();
    renderApp("/professional/alerts");

    expect(await screen.findByRole("heading", { level: 1, name: "Alerts" })).toBeInTheDocument();
    expect(await screen.findByText("2 unreviewed across all patients")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("link", { name: /Alerts/ }))
      .toHaveAttribute("href", "/professional/alerts");

    await user.click(screen.getAllByRole("button", { name: "Mark reviewed" })[0]);
    expect(await screen.findByText("1 unreviewed across all patients")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Patient alerts" })).getByText("Reviewed"))
      .toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Patient"), MAYA);
    await user.selectOptions(screen.getByLabelText("Review status"), "reviewed");
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Patient alerts" }))
      .getAllByRole("listitem")).toHaveLength(1));
    const list = within(screen.getByRole("region", { name: "Patient alerts" }));
    expect(list.getByText("Maya Chen")).toBeInTheDocument();
    expect(list.queryByText("Daniel Okafor")).not.toBeInTheDocument();
    expect(screen.getByText("1 unreviewed across all patients")).toBeInTheDocument();
    expect(spy.mock.calls.some(([url]) => new URL(url).searchParams.get("status") === "reviewed")).toBe(true);
  });
});
