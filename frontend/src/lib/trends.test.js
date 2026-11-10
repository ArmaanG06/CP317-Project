// TR_REP-1 helpers: inclusive periods, blood-pressure pairing and summaries.
import { describe, expect, it } from "vitest";
import { buildSeries, checkRange, periodParams, presetRange, summaryText } from "./trends";

const row = (vital_type, value, recorded_at, submission_id = recorded_at) => ({ vital_type, value, recorded_at, submission_id });

describe("trend helpers", () => {
  it("makes both ends of a period inclusive in the user's own timezone", () => {
    const { start, end } = periodParams("2026-11-01", "2026-11-07");
    expect(start).toBe(new Date(2026, 10, 1, 0, 0, 0, 0).toISOString());
    expect(end).toBe(new Date(2026, 10, 7, 23, 59, 59, 999).toISOString());
  });

  it("counts today as the last day of a preset", () => {
    expect(presetRange(7, new Date(2026, 10, 10, 15))).toEqual({ from: "2026-11-04", to: "2026-11-10", days: 7 });
  });

  it("rejects a missing date or a start after the end", () => {
    expect(checkRange("", "2026-11-07")).toMatch(/both a start date and an end date/);
    expect(checkRange("2026-11-08", "2026-11-07")).toMatch(/on or before the end date/);
    expect(checkRange("2026-11-07", "2026-11-07")).toBeNull();
  });

  it("pairs systolic and diastolic from the same submission into one point", () => {
    const charts = buildSeries([
      row("systolic", 120, "2026-11-01T08:00:00Z", "a"),
      row("diastolic", 80, "2026-11-01T08:00:00Z", "a"),
      row("heart_rate", 70, "2026-11-01T08:00:00Z", "a"),
      row("systolic", 130, "2026-11-02T08:00:00Z", "b"),
      row("diastolic", 85, "2026-11-02T08:00:00Z", "b"),
    ]);
    const bp = charts.find((c) => c.key === "bp");
    expect(bp.points).toEqual([
      { t: Date.parse("2026-11-01T08:00:00Z"), systolic: 120, diastolic: 80 },
      { t: Date.parse("2026-11-02T08:00:00Z"), systolic: 130, diastolic: 85 },
    ]);
    expect(charts.find((c) => c.key === "heart_rate").points).toHaveLength(1);
    expect(charts.find((c) => c.key === "spo2").points).toEqual([]);
  });

  it("summarizes each line in plain language with units", () => {
    const charts = buildSeries([
      row("temperature", 36.6, "2026-11-01T08:00:00Z"),
      row("temperature", 37.1, "2026-11-02T08:00:00Z"),
      row("systolic", 120, "2026-11-01T08:00:00Z", "a"),
      row("diastolic", 80, "2026-11-01T08:00:00Z", "a"),
    ]);
    expect(summaryText(charts.find((c) => c.key === "temperature"))).toBe(
      "2 readings. Lowest 36.6, highest 37.1, average 36.9 °C. Latest 37.1 °C."
    );
    expect(summaryText(charts.find((c) => c.key === "bp"))).toBe(
      "Systolic: 1 reading. Lowest 120, highest 120, average 120 mmHg. Latest 120 mmHg. " +
        "Diastolic: 1 reading. Lowest 80, highest 80, average 80 mmHg. Latest 80 mmHg."
    );
  });
});
