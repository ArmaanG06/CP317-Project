// MON-1-T2: roster entries link to the right patient dashboard; empty and error states.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import AppRoutes from "../AppRoutes.jsx";

function mockFetch(status, body) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function renderRoster() {
  render(
    <MemoryRouter initialEntries={["/roster"]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

const ROSTER = [
  { patient_id: 1, assigned_at: "2026-10-01T12:00:00Z", dashboard_path: "/patients/1" },
  { patient_id: 3, assigned_at: "2026-10-02T12:00:00Z", dashboard_path: "/patients/3" },
];

describe("Professional roster", () => {
  it("requests the signed-in professional's roster", async () => {
    const fetchSpy = mockFetch(200, []);
    renderRoster();
    await screen.findByText("No patients are assigned to you yet.");
    expect(fetchSpy).toHaveBeenCalledWith("/api/professionals/me/patients", { credentials: "include" });
  });

  it("shows a loading state first", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));
    renderRoster();
    expect(screen.getByRole("status")).toHaveTextContent("Loading patients");
  });

  it("shows an empty state when no patients are assigned", async () => {
    mockFetch(200, []);
    renderRoster();
    expect(await screen.findByText("No patients are assigned to you yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Assigned patients" })).not.toBeInTheDocument();
  });

  it("lists only the patients the API returns, each linking to its dashboard", async () => {
    mockFetch(200, ROSTER);
    renderRoster();
    const links = await screen.findAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Patient #1", "Patient #3"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/patients/1", "/patients/3"]);
  });

  it("opens the selected patient's dashboard", async () => {
    mockFetch(200, ROSTER);
    const user = userEvent.setup();
    renderRoster();
    await user.click(await screen.findByRole("link", { name: "Patient #3" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Patient dashboard");
  });

  it("explains a 403 to non-professionals", async () => {
    mockFetch(403, { detail: "Only professionals can use this feature." });
    renderRoster();
    expect(await screen.findByRole("alert")).toHaveTextContent("Only health professionals");
  });

  it("shows a generic error when the request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    renderRoster();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your patients");
  });
});
