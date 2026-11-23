// THR-1: configure thresholds for an assigned patient.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, PROFESSIONAL, renderApp } from "../test/renderApp";

const ID = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const roster = [{ patient_id: ID, full_name: "Maya Chen", assigned_at: "2026-10-01T12:00:00Z", dashboard_path: `/professional/patients/${ID}` }];
const item = (vital_type, lower, upper, extra = {}) => ({
  vital_type, lower, upper, source: "default", updated_at: null, updated_by_name: null, ...extra,
});
const LIST = [
  item("heart_rate", 60, 100),
  item("systolic", 90, 139),
  item("diastolic", 60, 89),
  item("temperature", 35, 37.9),
  item("spo2", 95, 100),
];
const base = {
  "/professionals/me/patients": roster,
  [`/patients/${ID}/readings/latest`]: [],
  [`/patients/${ID}/readings/flags`]: [],
  [`/patients/${ID}/thresholds`]: LIST,
};
const sent = (spy, method) =>
  spy.mock.calls.filter(([, init]) => init?.method === method).map(([url, init]) => [new URL(url).pathname, JSON.parse(init.body ?? "null")]);

describe("Flag thresholds (THR-1)", () => {
  it("shows the five limits with default chips", async () => {
    mockApi(PROFESSIONAL, base);
    renderApp(`/professional/patients/${ID}`);
    const form = await screen.findByRole("form", { name: "Heart rate limits" });
    expect(within(form).getByLabelText(/Low limit/)).toHaveValue("60");
    expect(within(form).getByLabelText(/High limit/)).toHaveValue("100");
    expect(within(form).getByText("Default limits")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Oxygen saturation limits" })).toBeInTheDocument();
    expect(screen.getByText(/existing\s+flags stay as they were/)).toBeInTheDocument();
  });

  it("saves numeric limits for the chosen measurement", async () => {
    const spy = mockApi(PROFESSIONAL, {
      ...base,
      [`/patients/${ID}/thresholds/heart_rate`]: item("heart_rate", 50, 110, { source: "patient_override" }),
    });
    const user = userEvent.setup();
    renderApp(`/professional/patients/${ID}`);
    const form = await screen.findByRole("form", { name: "Heart rate limits" });
    const low = within(form).getByLabelText(/Low limit/);
    const high = within(form).getByLabelText(/High limit/);
    await user.clear(low); await user.type(low, "50");
    await user.clear(high); await user.type(high, "110");
    await user.click(within(form).getByRole("button", { name: /Save heart rate limits/ }));
    expect(await within(form).findByRole("status")).toHaveTextContent("Saved");
    expect(sent(spy, "PUT")).toEqual([[`/patients/${ID}/thresholds/heart_rate`, { lower: 50, upper: 110 }]]);
  });

  it("rejects non-numeric values and low >= high without calling the server", async () => {
    const spy = mockApi(PROFESSIONAL, base);
    const user = userEvent.setup();
    renderApp(`/professional/patients/${ID}`);
    const form = await screen.findByRole("form", { name: "Heart rate limits" });
    const low = within(form).getByLabelText(/Low limit/);
    await user.clear(low); await user.type(low, "abc");
    await user.click(within(form).getByRole("button", { name: /Save/ }));
    expect(within(form).getByText("Heart rate low limit must be a number.")).toBeInTheDocument();

    await user.clear(low); await user.type(low, "120");
    await user.click(within(form).getByRole("button", { name: /Save/ }));
    expect(within(form).getByText("Heart rate low limit must be lower than the high limit.")).toBeInTheDocument();
    expect(sent(spy, "PUT")).toEqual([]);
  });

  it("shows the server's message when saving fails", async () => {
    mockApi(PROFESSIONAL, {
      ...base,
      [`/patients/${ID}/thresholds/heart_rate`]: [403, { detail: "You can only manage thresholds for your assigned patients." }],
    });
    const user = userEvent.setup();
    renderApp(`/professional/patients/${ID}`);
    const form = await screen.findByRole("form", { name: "Heart rate limits" });
    await user.click(within(form).getByRole("button", { name: /Save/ }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("You can only manage thresholds for your assigned patients.");
  });

  it("shows who changed custom limits and offers a reset", async () => {
    mockApi(PROFESSIONAL, {
      ...base,
      [`/patients/${ID}/thresholds`]: [
        item("heart_rate", 50, 110, { source: "patient_override", updated_at: "2026-11-20T15:00:00Z", updated_by_name: "Dr. Lee" }),
        ...LIST.slice(1),
      ],
    });
    renderApp(`/professional/patients/${ID}`);
    const form = await screen.findByRole("form", { name: "Heart rate limits" });
    expect(within(form).getByText("Custom limits")).toBeInTheDocument();
    expect(within(form).getByText(/by Dr\. Lee/)).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Reset to default" })).toBeInTheDocument();
  });
});
