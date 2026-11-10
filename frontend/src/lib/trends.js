// TR_REP-1 / MON-2: turns the backend's /readings/history rows into chart data and plain-language summaries.
import { LIMITS } from "./vitals";

export const PRESETS = [7, 30, 90]; // "Last N days" buttons
export const DEFAULT_DAYS = 30; // matches DEFAULT_HISTORY_DAYS in backend/app/readings.py

const pad = (n) => String(n).padStart(2, "0");
export const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "Last N days" means today plus the N-1 days before it, in the user's own timezone.
export function presetRange(days, today = new Date()) {
  const from = new Date(today);
  from.setDate(today.getDate() - (days - 1));
  return { from: toDateInput(from), to: toDateInput(today), days };
}

// Both ends inclusive: from the start of the first local day to the last millisecond of the last one.
export function periodParams(from, to) {
  return {
    start: new Date(`${from}T00:00:00`).toISOString(),
    end: new Date(`${to}T23:59:59.999`).toISOString(),
  };
}

export function checkRange(from, to) {
  if (!from || !to) return "Choose both a start date and an end date.";
  if (from > to) return "The start date must be on or before the end date.";
  return null;
}

// One chart per vital. Blood pressure pairs systolic and diastolic from the same submission into one point.
export const CHARTS = [
  { key: "heart_rate", label: LIMITS.heart_rate.label, unit: "bpm", decimals: 0, lines: [{ key: "heart_rate", name: "Heart rate" }] },
  {
    key: "bp",
    label: "Blood pressure",
    unit: "mmHg",
    decimals: 0,
    lines: [
      { key: "systolic", name: "Systolic" },
      { key: "diastolic", name: "Diastolic" },
    ],
  },
  { key: "temperature", label: LIMITS.temperature.label, unit: "°C", decimals: 1, lines: [{ key: "temperature", name: "Temperature" }] },
  { key: "spo2", label: LIMITS.spo2.label, unit: "%", decimals: 0, lines: [{ key: "spo2", name: "Oxygen saturation" }] },
];

export function buildSeries(readings = []) {
  const points = Object.fromEntries(CHARTS.map((c) => [c.key, []]));
  const bp = new Map(); // submission_id -> point
  for (const r of readings) {
    const t = new Date(r.recorded_at).getTime();
    if (r.vital_type === "systolic" || r.vital_type === "diastolic") {
      if (!bp.has(r.submission_id)) {
        bp.set(r.submission_id, { t });
        points.bp.push(bp.get(r.submission_id));
      }
      bp.get(r.submission_id)[r.vital_type] = r.value;
    } else if (r.vital_type in points) {
      points[r.vital_type].push({ t, [r.vital_type]: r.value });
    }
  }
  return CHARTS.map((c) => ({ ...c, points: points[c.key] }));
}

const fmt = (n, decimals) => n.toFixed(decimals);

export function summarize(chart) {
  return chart.lines.map(({ key, name }) => {
    const values = chart.points.map((p) => p[key]).filter((v) => typeof v === "number");
    if (!values.length) return { name, count: 0 };
    const total = values.reduce((a, b) => a + b, 0);
    return {
      name,
      count: values.length,
      min: fmt(Math.min(...values), chart.decimals),
      max: fmt(Math.max(...values), chart.decimals),
      avg: fmt(total / values.length, chart.decimals),
      latest: fmt(values[values.length - 1], chart.decimals),
    };
  });
}

// e.g. "60 readings. Lowest 66, highest 118, average 73 bpm. Latest 71 bpm."
export function summaryText(chart) {
  const parts = summarize(chart).map((s) => {
    const who = chart.lines.length > 1 ? `${s.name}: ` : "";
    if (!s.count) return `${who}no readings.`;
    const n = `${s.count} ${s.count === 1 ? "reading" : "readings"}`;
    return `${who}${n}. Lowest ${s.min}, highest ${s.max}, average ${s.avg} ${chart.unit}. Latest ${s.latest} ${chart.unit}.`;
  });
  return parts.join(" ");
}

export const formatDay = (ms) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const formatMoment = (ms) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
export const formatRange = (from, to) => {
  const opts = { month: "short", day: "numeric", year: "numeric" };
  const a = new Date(`${from}T00:00:00`).toLocaleDateString("en-US", opts);
  const b = new Date(`${to}T00:00:00`).toLocaleDateString("en-US", opts);
  return from === to ? a : `${a} – ${b}`;
};
