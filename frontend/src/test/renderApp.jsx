// Renders the real app (routes, AuthProvider, AppShell) at a URL, with the network faked.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "../App";
import { AuthProvider } from "../auth/AuthContext";

export const PATIENT = { id: "p-1", email: "maya.chen@example.com", full_name: "Maya Chen", role: "patient" };
export const PROFESSIONAL = { id: "d-1", email: "dr.lee@example.com", full_name: "Dr. Lee", role: "professional" };

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// `routes` maps an API path to a body, or to [status, body]. Unlisted paths return 404.
export function mockApi(user, routes = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = new URL(url).pathname;
    if (path === "/auth/me") return user ? json(200, user) : json(401, { detail: "Not signed in." });
    if (path in routes) {
      const r = routes[path];
      return Array.isArray(r) && typeof r[0] === "number" ? json(r[0], r[1]) : json(200, r);
    }
    if (path === "/readings/latest") return json(200, []);
    return json(404, { detail: "Not found" });
  });
}

export function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>
  );
}
