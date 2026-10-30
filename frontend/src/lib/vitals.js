// Limits mirror VITAL_LIMITS in backend/app/readings.py. The server is the source of truth;
// these checks only give faster feedback.
export const LIMITS = {
  heart_rate: { label: "Heart rate", unit: "bpm", min: 20, max: 250, decimals: 0 },
  systolic: { label: "Systolic pressure", unit: "mmHg", min: 50, max: 250, decimals: 0 },
  diastolic: { label: "Diastolic pressure", unit: "mmHg", min: 30, max: 150, decimals: 0 },
  temperature: { label: "Body temperature", unit: "°C", min: 30, max: 45, decimals: 1 },
  spo2: { label: "Oxygen saturation", unit: "%", min: 50, max: 100, decimals: 0 },
};

export const FORM_ORDER = ["heart_rate", "temperature", "systolic", "diastolic", "spo2"];

const fix = (k, n) => n.toFixed(LIMITS[k].decimals);
export const rangeText = (k) => `${fix(k, LIMITS[k].min)}–${fix(k, LIMITS[k].max)} ${LIMITS[k].unit}`;

export function validateForm(values) {
  const fields = {};
  const val = (k) => (values[k] ?? "").trim();

  for (const k of FORM_ORDER) {
    const raw = val(k);
    if (!raw) continue; // every field is optional, but see "at least one" below
    const { label, min, max, decimals, unit } = LIMITS[k];
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      fields[k] = `${label} must be a number.`;
      continue;
    }
    const n = Number(raw);
    if (decimals === 0 && !Number.isInteger(n)) fields[k] = `${label} must be a whole number.`;
    else if (decimals === 1 && Math.abs(n * 10 - Math.round(n * 10)) > 1e-9)
      fields[k] = `${label} can have at most 1 decimal place.`;
    else if (n < min || n > max)
      fields[k] = `Enter ${label.toLowerCase()} between ${fix(k, min)} and ${fix(k, max)} ${unit}.`;
  }

  const s = val("systolic");
  const d = val("diastolic");
  if (s && !d && !fields.diastolic) fields.diastolic = "Enter diastolic pressure to go with systolic.";
  if (d && !s && !fields.systolic) fields.systolic = "Enter systolic pressure to go with diastolic.";
  if (s && d && !fields.systolic && !fields.diastolic && Number(s) <= Number(d))
    fields.systolic = "Systolic pressure must be greater than diastolic pressure.";

  const any = FORM_ORDER.some((k) => val(k));
  return { fields, form: any ? null : "Enter at least one reading." };
}

// Only filled-in fields are sent, as numbers.
export function toPayload(values) {
  const out = {};
  for (const k of FORM_ORDER) {
    const raw = (values[k] ?? "").trim();
    if (raw) out[k] = Number(raw);
  }
  return out;
}

export function formatWhen(iso) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

// Turns the backend's 5-row /readings/latest list into the 4 dashboard cards.
export function buildCards(rows) {
  const by = Object.fromEntries((rows ?? []).map((r) => [r.vital_type, r]));
  const one = (k, fmt) => (by[k]?.available ? { display: fmt(by[k].value), at: by[k].recorded_at } : null);
  const bp =
    by.systolic?.available && by.diastolic?.available
      ? { display: `${by.systolic.value}/${by.diastolic.value}`, at: by.systolic.recorded_at }
      : null;
  return [
    { label: "Heart rate", unit: "bpm", icon: "heart", reading: one("heart_rate", String) },
    { label: "Blood pressure", unit: "mmHg", icon: "bp", reading: bp },
    { label: "Body temperature", unit: "°C", icon: "temp", reading: one("temperature", (v) => v.toFixed(1)) },
    { label: "Oxygen saturation", unit: "%", icon: "spo2", reading: one("spo2", String) },
  ];
}
