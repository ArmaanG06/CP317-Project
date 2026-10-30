// UI-2-T2: verify one-click navigation and keyboard operation of the patient navigation.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { mockApi, PATIENT, renderApp } from "../test/renderApp";

// UI-2-T1 pages: dashboard, reading entry, history, appointments (+ profile, also in the nav).
const PAGES = [
  { label: "Dashboard", path: "/patient", heading: /Good (morning|afternoon|evening), Maya/ },
  { label: "Record vitals", path: "/patient/record", heading: "Record a reading" },
  { label: "Trends & history", path: "/patient/trends", heading: "Trends & history" },
  { label: "Appointments", path: "/patient/appointments", heading: "Appointments" },
];

async function openAs(path) {
  mockApi(PATIENT);
  renderApp(path);
  const nav = within(await screen.findByRole("navigation", { name: "Main" }));
  return nav;
}

const heading = () => screen.getByRole("heading", { level: 1 });
const current = (nav) => nav.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");

describe("Patient navigation (UI-2)", () => {
  it("links the dashboard, reading entry, history and appointments", async () => {
    const nav = await openAs("/patient");
    for (const { label, path } of PAGES) {
      expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", path);
    }
  });

  it.each(PAGES)("reaches $label in one click from every other page", async ({ label, path, heading: h }) => {
    for (const start of PAGES.filter((p) => p.path !== path)) {
      const user = userEvent.setup();
      const nav = await openAs(start.path);
      await user.click(nav.getByRole("link", { name: label }));
      expect(heading()).toHaveTextContent(h);
      document.body.innerHTML = "";
    }
  });

  it.each(PAGES)("marks $label as the current page, and only that one", async ({ label, path }) => {
    const nav = await openAs(path);
    expect(current(nav)).toHaveLength(1);
    expect(current(nav)[0]).toHaveTextContent(label);
  });

  it("moves the current-page marker when you navigate", async () => {
    const user = userEvent.setup();
    const nav = await openAs("/patient");
    await user.click(nav.getByRole("link", { name: "Appointments" }));
    expect(current(nav).map((a) => a.textContent)).toEqual(["Appointments"]);
  });

  it("works with the keyboard alone: Tab through links in order, Enter to open", async () => {
    const user = userEvent.setup();
    const nav = await openAs("/patient");
    await user.tab(); // skip link comes first
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();

    const links = nav.getAllByRole("link");
    for (const link of links) {
      await user.tab();
      expect(link).toHaveFocus();
    }

    await user.tab({ shift: true }); // back from "My profile" to "Appointments"
    expect(nav.getByRole("link", { name: "Appointments" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(heading()).toHaveTextContent("Appointments");
  });

  it("has a skip link that targets the main content", async () => {
    await openAs("/patient/record");
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("hides nav icons from screen readers so each link reads as its label", async () => {
    const nav = await openAs("/patient");
    for (const link of nav.getAllByRole("link")) {
      link.querySelectorAll("svg").forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
    }
  });
});
