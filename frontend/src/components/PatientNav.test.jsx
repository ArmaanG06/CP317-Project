// UI-2-T2: verify one-click navigation and keyboard operation.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import AppRoutes from "../AppRoutes.jsx";
import { PATIENT_LINKS } from "./PatientNav.jsx";

const PAGE_HEADINGS = {
  "/dashboard": "Dashboard",
  "/readings/new": "Enter a reading",
  "/history": "History",
  "/appointments": "Appointments",
};

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return within(screen.getByRole("navigation", { name: "Patient navigation" }));
}

describe("Patient navigation", () => {
  it("shows all four links in order on every patient page", () => {
    for (const path of Object.keys(PAGE_HEADINGS)) {
      const nav = renderAt(path);
      expect(nav.getAllByRole("link").map((a) => a.textContent)).toEqual(PATIENT_LINKS.map((l) => l.label));
      document.body.innerHTML = "";
    }
  });

  it.each(PATIENT_LINKS)("reaches $label in one click from any page", async ({ to, label }) => {
    for (const start of Object.keys(PAGE_HEADINGS)) {
      const user = userEvent.setup();
      const nav = renderAt(start);
      await user.click(nav.getByRole("link", { name: label }));
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(PAGE_HEADINGS[to]);
      document.body.innerHTML = "";
    }
  });

  it("marks exactly one link as the current page", async () => {
    const user = userEvent.setup();
    const nav = renderAt("/dashboard");
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");

    await user.click(nav.getByRole("link", { name: "History" }));
    const current = nav.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("History");
    expect(current[0]).toHaveClass("active");
  });

  it("can be operated with the keyboard alone (Tab to move, Enter to open)", async () => {
    const user = userEvent.setup();
    const nav = renderAt("/dashboard");
    const links = nav.getAllByRole("link");

    // Tab visits every link in visual order.
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }

    // Shift+Tab back to "Enter reading" and press Enter.
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(nav.getByRole("link", { name: "Enter reading" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Enter a reading");
  });

  it("uses real links with destinations (no click-only elements)", () => {
    const nav = renderAt("/dashboard");
    PATIENT_LINKS.forEach(({ to, label }) => {
      expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", to);
    });
  });
});
