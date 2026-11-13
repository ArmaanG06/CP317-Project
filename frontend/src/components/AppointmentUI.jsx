import {
  ArrowLeft, Calendar, CalendarCheck, Check, ChevronLeft, ChevronRight, Circle, Clock, Eye, FileText, Info, MapPin,
  Search, Trash2, User, X,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { dateKey, formatDate, localDate } from "../lib/appointments";

// Icon names used across the appointment pages, mapped to lucide icons (sizes follow the Figma: 16 small, 20 default).
const ICONS = {
  back: [ArrowLeft, 18], previous: [ChevronLeft, 20], next: [ChevronRight, 20], close: [X, 20], search: [Search, 18],
  info: [Info, 20], selected: [Check, 18], cancel: [X, 16], remove: [Trash2, 16], notes: [FileText, 16], view: [Eye, 16],
  booked: [CalendarCheck, 14], open: [Circle, 14], completed: [Check, 14],
  "person-small": [User, 16], "pin-small": [MapPin, 16], "clock-small": [Clock, 16],
  "dialog-date": [Calendar, 20], "dialog-time": [Clock, 20], "dialog-person": [User, 20], "dialog-pin": [MapPin, 20],
  "dialog-info": [Info, 20],
};

export function Icon({ name }) {
  const [Glyph, size] = ICONS[name] ?? [Circle, 16];
  return <Glyph size={size} aria-hidden="true" className="shrink-0" />;
}

export function Avatar({ name, large = false }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white ${large ? "size-16" : "size-8"}`}>
      {initials}
    </span>
  );
}

export function Badge({ status }) {
  const tones = {
    booked: "bg-ok-bg text-ok-text",
    open: "bg-primary-tint text-primary-dark",
    completed: "border border-line bg-canvas text-muted",
    cancelled: "bg-alert-bg text-alert-text",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm leading-4 font-semibold capitalize ${tones[status]}`}>
      <Icon name={status === "cancelled" ? "cancel" : status} />{status}
    </span>
  );
}

export function MonthCalendar({ month, onMonth, selected, onSelect, slots, professional = false }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const available = new Set(slots.filter((slot) => !slot.booked).map((slot) => dateKey(slot.starts_at)));
  const booked = new Set(slots.filter((slot) => slot.booked).map((slot) => dateKey(slot.starts_at)));
  const move = (offset) => onMonth(new Date(year, monthIndex + offset, 1));

  return (
    <div className="mx-auto w-full max-w-[392px]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="Previous month" className="appt-round" onClick={() => move(-1)}><Icon name="previous" /></button>
        <h2 aria-live="polite" className="text-center font-semibold">{formatDate(month, { month: "long", year: "numeric" })}</h2>
        <button type="button" aria-label="Next month" className="appt-round" onClick={() => move(1)}><Icon name="next" /></button>
      </div>
      <div className="grid grid-cols-7 justify-items-center gap-y-2 text-center">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="mb-1 text-sm text-muted">{day}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const day = index + 1;
          const key = dateKey(new Date(year, monthIndex, day));
          const isSelected = key === selected;
          const hasOpen = available.has(key);
          const hasBooked = professional && booked.has(key);
          return (
            <button
              key={key} type="button" disabled={!hasOpen && !hasBooked && !isSelected}
              aria-label={formatDate(localDate(key))} aria-pressed={isSelected}
              onClick={() => onSelect(key)}
              className={`relative grid size-9 place-items-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent sm:size-11 ${isSelected ? "bg-primary font-semibold text-white" : hasOpen || hasBooked ? "bg-primary-tint font-semibold text-primary-dark hover:bg-line" : "text-muted"}`}
            >
              {day}
              {hasBooked && <span className="absolute bottom-1 size-1.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
        <span className="flex items-center gap-2"><i className="size-4 rounded-full bg-primary-tint" />Open times</span>
        <span className="flex items-center gap-2"><i className="size-4 rounded-full bg-primary" />Selected</span>
        {professional && <span className="flex items-center gap-2"><i className="size-4 rounded-full bg-accent" />Has booked visits</span>}
      </div>
    </div>
  );
}

export function Dialog({ title, onClose, busy = false, drawer = false, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={dialog} aria-labelledby="appointment-dialog-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      className={drawer
        ? "appt-drawer fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-[480px] bg-card p-8 text-ink"
        : "appt-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-[520px] rounded-[24px] border border-line bg-card p-8 text-ink"}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="appointment-dialog-title" className="text-xl font-semibold">{title}</h2>
        {drawer && <button type="button" className="appt-round" disabled={busy} aria-label="Close" onClick={onClose}><Icon name="close" /></button>}
      </div>
      {children}
    </dialog>
  );
}
