// Session notes (Figma 17–20): professionals write and publish notes; patients read published notes.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, PATIENT, PROFESSIONAL, renderApp } from "../test/renderApp";

const MAYA = "8cbfce12-7d92-48b0-96cb-eac3b00cf321";
const slot = {
  id: "s1", starts_at: "2026-10-27T13:30:00Z", ends_at: "2026-10-27T14:00:00Z", location: "Clinic A, Waterloo",
  professional_id: "d-1", professional_name: "Dr. Lee", booked: false,
};
const visit = (extra = {}) => ({
  id: "b1", slot, patient_id: MAYA, patient_name: "Maya Chen", professional_name: "Dr. Lee",
  reason: "Reason for visit: Monthly check-in.", status: "completed", notes_published: false, has_draft_notes: false,
  shared_notes: null, internal_notes: null, notes_published_at: null, notes_updated_at: null, ...extra,
});
const PUBLISHED = visit({
  notes_published: true, shared_notes: "Summary: steady readings.\nPlan: keep recording.",
  notes_published_at: "2026-10-27T15:00:00Z",
});

const calls = (spy, method) =>
  spy.mock.calls.filter(([, opts]) => (opts?.method ?? "GET") === method).map(([url, opts]) => [new URL(url).pathname, opts]);

describe("Patient appointment details", () => {
  it("links completed visits to their notes from the appointments list", async () => {
    mockApi(PATIENT, { "/appointments": [PUBLISHED, visit({ id: "b2" })], "/appointments/slots": [] });
    renderApp("/patient/appointments");
    expect(await screen.findByRole("link", { name: "View notes" })).toHaveAttribute("href", "/patient/appointments/visit/b1");
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute("href", "/patient/appointments/visit/b2");
  });

  it("shows published notes from the professional", async () => {
    mockApi(PATIENT, { "/appointments/bookings/b1": PUBLISHED });
    renderApp("/patient/appointments/visit/b1");
    const notes = await screen.findByRole("region", { name: "Notes from Dr. Lee" });
    expect(notes).toHaveTextContent("Summary: steady readings.");
    expect(within(notes).getByText("Published")).toBeInTheDocument();
    expect(screen.getByText(/Clinic A, Waterloo/)).toBeInTheDocument();
  });

  it("explains when notes haven't been shared yet", async () => {
    mockApi(PATIENT, { "/appointments/bookings/b1": visit() });
    renderApp("/patient/appointments/visit/b1");
    expect(await screen.findByText("Dr. Lee hasn’t shared notes for this visit yet.")).toBeInTheDocument();
  });
});

describe("Professional session notes", () => {
  it("saves a draft and publishes notes after confirming", async () => {
    const spy = mockApi(PROFESSIONAL, {
      "/appointments/bookings/b1": visit(),
      "/appointments/bookings/b1/notes": PUBLISHED,
      [`/patients/${MAYA}/readings/latest`]: [],
    });
    const user = userEvent.setup();
    renderApp("/professional/schedule/notes/b1");
    const box = await screen.findByRole("textbox", { name: "Notes for Maya" });
    expect(screen.getByText("No notes yet")).toBeInTheDocument();

    await user.type(box, "Summary: steady readings.");
    await user.click(screen.getByRole("button", { name: "Publish to patient" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Internal notes stay private.");
    await user.click(within(dialog).getByRole("button", { name: "Publish notes" }));

    expect(await screen.findByText("Notes published. Maya can now see them.")).toBeInTheDocument();
    const [[path, opts]] = calls(spy, "PUT");
    expect(path).toBe("/appointments/bookings/b1/notes");
    expect(JSON.parse(opts.body)).toEqual({ shared_notes: "Summary: steady readings.", publish: true });
    expect(screen.getByText("Published")).toBeInTheDocument();
  });

  it("saves internal notes separately", async () => {
    const spy = mockApi(PROFESSIONAL, {
      "/appointments/bookings/b1": visit(),
      "/appointments/bookings/b1/notes": visit({ internal_notes: "Ask about sleep." }),
      [`/patients/${MAYA}/readings/latest`]: [],
    });
    const user = userEvent.setup();
    renderApp("/professional/schedule/notes/b1");
    await user.type(await screen.findByRole("textbox", { name: "Internal notes" }), "Ask about sleep.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Internal notes saved.")).toBeInTheDocument();
    expect(JSON.parse(calls(spy, "PUT")[0][1].body)).toEqual({ internal_notes: "Ask about sleep." });
  });

  it("does not offer notes for a cancelled visit", async () => {
    mockApi(PROFESSIONAL, {
      "/appointments/bookings/b1": visit({ status: "cancelled" }),
      [`/patients/${MAYA}/readings/latest`]: [],
    });
    renderApp("/professional/schedule/notes/b1");
    expect(await screen.findByText("This appointment was cancelled")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Internal notes" })).not.toBeInTheDocument();
  });

  it("lists the patient's past visits on their dashboard with links to the notes", async () => {
    mockApi(PROFESSIONAL, {
      "/professionals/me/patients": [{ patient_id: MAYA, full_name: "Maya Chen", assigned_at: "2026-10-01T12:00:00Z", dashboard_path: `/professional/patients/${MAYA}`, latest: [] }],
      [`/patients/${MAYA}/readings/latest`]: [],
      [`/patients/${MAYA}/readings/flags`]: [],
      "/appointments": [PUBLISHED, visit({ id: "b9", patient_id: "someone-else" })],
    });
    renderApp(`/professional/patients/${MAYA}`);
    const list = within(await screen.findByRole("list", { name: "Past visits" }));
    expect(list.getAllByRole("listitem")).toHaveLength(1);
    expect(list.getByText("Notes published")).toBeInTheDocument();
    expect(list.getByRole("link", { name: /Open notes/ })).toHaveAttribute("href", "/professional/schedule/notes/b1");
  });
});
