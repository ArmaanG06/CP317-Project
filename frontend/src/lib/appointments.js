export const APPOINTMENTS = "/patient/appointments";
export const SCHEDULE = "/professional/schedule";
export const notesPath = (bookingId) => `${SCHEDULE}/notes/${bookingId}`; // professional: write session notes
export const visitPath = (bookingId) => `${APPOINTMENTS}/visit/${bookingId}`; // patient: appointment details & notes

export function dateKey(value) {
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-");
}

export function localDate(key) {
  return new Date(`${key}T12:00`);
}

export function formatDate(value, options = { dateStyle: "full" }) {
  return new Intl.DateTimeFormat("en-CA", options).format(new Date(value));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function timeRange(slot) {
  return `${formatTime(slot.starts_at)} – ${formatTime(slot.ends_at)}`;
}

export function duration(slot) {
  return (Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60000;
}
