import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// jsdom has no ResizeObserver; recharts' ResponsiveContainer needs one. Charts render empty in tests,
// so tests check the text summaries and tables instead.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom has no <dialog> methods; the appointment dialogs call showModal/close.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.open = true; };
  HTMLDialogElement.prototype.close ??= function close() { this.open = false; };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
