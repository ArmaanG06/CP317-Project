import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useMatch, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Avatar, Badge, Dialog, Icon, MonthCalendar } from "../components/AppointmentUI";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
import { APPOINTMENTS, dateKey, duration, formatDate, formatTime, localDate, notesPath, timeRange, visitPath } from "../lib/appointments";
import usePageTitle from "../lib/usePageTitle";
import "./appointments.css";

const DATE_SHORT = { weekday: "short", month: "short", day: "numeric", year: "numeric" };
const DATE_DAY = { weekday: "long", month: "long", day: "numeric" };
const FILTERS = [["all", "All"], ["booked", "Upcoming"], ["completed", "Past"], ["cancelled", "Cancelled"]];
const CONTROL = "rounded-xl border border-field bg-card px-4 py-3 focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent";
const DANGER = "!bg-alert-text hover:!bg-[#781717]";
const OUTLINE_DANGER = "!border-alert-text !text-alert-text hover:!bg-alert-bg";
const canCancel = ({ status, slot }) => status === "booked" && Date.parse(slot.starts_at) > Date.now();

function PageHeading({ title, subtitle, action }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-9 font-bold">{title}</h1>
        <p className="mt-0.5 text-muted">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function DateTime({ slot }) {
  return (
    <>
      <div className="font-medium">{formatDate(slot.starts_at, DATE_SHORT)}</div>
      <div className="text-muted">{timeRange(slot)}</div>
    </>
  );
}

function TextAction({ icon, children, onClick, danger = false }) {
  return (
    <button type="button" onClick={onClick} className={`appt-link ${danger ? "!text-alert-text" : "!text-muted"}`}>
      <Icon name={icon} />{children}
    </button>
  );
}

function NotesAction({ booking, professional }) {
  if (booking.status !== "completed") return null;
  if (professional) {
    return (
      <Link to={notesPath(booking.id)} className="appt-link !text-accent">
        <Icon name="notes" />Notes{booking.has_draft_notes && <span className="text-muted"> (draft)</span>}
      </Link>
    );
  }
  return (
    <Link to={visitPath(booking.id)} className="appt-link !text-accent">
      <Icon name="view" />{booking.notes_published ? "View notes" : "Details"}
    </Link>
  );
}

function BookingTable({ bookings, professional, onCancel }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const visible = bookings.filter((booking) =>
    (filter === "all" || booking.status === filter)
    && (!professional || booking.patient_name.toLowerCase().includes(search.trim().toLowerCase()))
  );

  return (
    <section className="appt-card overflow-hidden" aria-labelledby="all-appointments">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
        <h2 id="all-appointments" className="flex items-center gap-2.5 text-xl font-semibold">
          All appointments <span className="rounded-full bg-primary-tint px-3 py-1 text-sm font-normal text-primary-dark">{bookings.length}</span>
        </h2>
        {professional ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative">
              <span className="sr-only">Search by patient name</span>
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center"><Icon name="search" /></span>
              <input type="search" placeholder="Search by patient name" value={search} onChange={(event) => setSearch(event.target.value)} className={`${CONTROL} !py-2.5 !pl-11`} />
            </label>
            <label>
              <span className="sr-only">Filter by status</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value)} className={`${CONTROL} !py-2.5`}>
                <option value="all">All status</option>
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1 rounded-full bg-canvas p-1" aria-label="Filter appointments">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-accent ${filter === value ? "bg-card shadow-[0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-card"}`}>
                {label} ({value === "all" ? bookings.length : bookings.filter((item) => item.status === value).length})
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="appt-table">
          <thead><tr>
            {professional && <th scope="col">Patient</th>}
            <th scope="col">Date &amp; time</th>
            {!professional && <th scope="col">With</th>}
            <th scope="col">Location</th><th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr></thead>
          <tbody>
            {visible.map((booking) => {
              const { slot, patient_name: patientName, status, reason } = booking;
              const name = professional ? patientName : slot.professional_name;
              const identity = (
                <div className="flex items-center gap-2.5">
                  <Avatar name={name} />
                  <div>{name}{professional && reason && <details className="text-muted"><summary>Reason for visit</summary><p className="max-w-xs break-words whitespace-pre-wrap">{reason}</p></details>}</div>
                </div>
              );
              return (
                <tr key={booking.id}>
                  {professional && <td>{identity}</td>}
                  <td><DateTime slot={slot} /></td>
                  {!professional && <td>{identity}</td>}
                  <td>{slot.location}</td><td><Badge status={status} /></td>
                  <td>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {booking.status === "completed" && <NotesAction booking={booking} professional={professional} />}
                      {canCancel(booking) && <TextAction icon="cancel" danger onClick={() => onCancel(booking)}>Cancel</TextAction>}
                      {booking.status !== "completed" && !canCancel(booking) && <span aria-label="No actions">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visible.length && <tr><td colSpan={5} className="text-muted">No appointments match this view.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NextAppointment({ booking, onCancel }) {
  if (!booking) return null;
  const { slot } = booking;
  return (
    <section className="appt-card flex flex-wrap items-center gap-6 p-6">
      <div className="flex w-[76px] shrink-0 flex-col items-center rounded-2xl bg-primary-tint py-3 text-sm font-semibold text-primary-dark">
        <span className="uppercase">{formatDate(slot.starts_at, { weekday: "short" })}</span>
        <strong className="text-4xl">{new Date(slot.starts_at).getDate()}</strong>
        <span className="uppercase">{formatDate(slot.starts_at, { month: "short" })}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">Your next appointment</p>
        <h2 className="my-1.5 text-xl font-semibold">{formatDate(slot.starts_at, DATE_DAY)} · {timeRange(slot)}</h2>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-muted">
          <span className="flex items-center gap-2"><Icon name="person-small" />{slot.professional_name}</span>
          <span className="flex items-center gap-2"><Icon name="pin-small" />{slot.location}</span>
          <span className="flex items-center gap-2"><Icon name="clock-small" />{duration(slot)} minutes</span>
        </div>
      </div>
      <div className="ml-auto flex flex-col items-end gap-3">
        <Badge status="booked" />
        <Button variant="secondary" className={OUTLINE_DANGER} onClick={() => onCancel(booking)}>Cancel appointment</Button>
      </div>
    </section>
  );
}

function BookingSteps({ slots, selectedSlot, chooseSlot, onBook, confirming, busy, error }) {
  const navigate = useNavigate();
  const [day, setDay] = useState(null);
  const [month, setMonth] = useState(null);
  const [professionalId, setProfessionalId] = useState(null);
  const [reason, setReason] = useState("");
  const professionals = [...new Map(slots.map((slot) => [slot.professional_id, slot.professional_name])).entries()];
  const activeProfessional = professionalId ?? selectedSlot?.professional_id ?? professionals[0]?.[0];
  const relevantSlots = slots.filter((slot) => slot.professional_id === activeProfessional);
  const firstSlot = relevantSlots.find((slot) => !slot.booked) ?? relevantSlots[0];
  const activeDay = day ?? (selectedSlot || firstSlot ? dateKey((selectedSlot ?? firstSlot).starts_at) : dateKey(new Date()));
  const activeMonth = month ?? localDate(activeDay);
  const times = relevantSlots.filter((slot) => dateKey(slot.starts_at) === activeDay);
  const activeSlot = times.find((slot) => slot.id === selectedSlot?.id && !slot.booked);
  const back = confirming ? `${APPOINTMENTS}/book` : APPOINTMENTS;
  const name = professionals.find(([id]) => id === activeProfessional)?.[1];

  return (
    <>
      <Link className="appt-link self-start" to={back}><Icon name="back" />{confirming ? "Choose a different time" : "Appointments"}</Link>
      <PageHeading
        title={confirming ? "Confirm your appointment" : "Book an appointment"}
        subtitle={confirming ? "Check the details, then confirm your booking." : name ? `With ${name}, your assigned health professional.` : "Choose a time with your care team."}
        action={<span className="rounded-full bg-primary-tint px-3 py-1 text-sm text-primary-dark">Step {confirming ? 2 : 1} of 2</span>}
      />
      {error && <Banner title={error} />}
      {confirming ? (
        <div className="grid gap-5 xl:grid-cols-[1.9fr_1fr]">
          <section className="appt-card p-6">
            <h2 className="text-xl font-semibold">Appointment details</h2>
            {selectedSlot && !selectedSlot.booked ? (
              <form onSubmit={(event) => { event.preventDefault(); onBook(selectedSlot, reason); }}>
                <dl className="my-5 grid gap-4">
                  {[
                    ["date", "Date", formatDate(selectedSlot.starts_at)],
                    ["time", "Time", `${timeRange(selectedSlot)} (${duration(selectedSlot)} minutes)`],
                    ["person", "With", selectedSlot.professional_name],
                    ["pin", "Location", selectedSlot.location],
                  ].map(([icon, label, value]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-full bg-primary-tint"><Icon name={icon} /></span>
                      <div><dt className="text-sm text-muted">{label}</dt><dd className="font-medium">{value}</dd></div>
                    </div>
                  ))}
                </dl>
                <label htmlFor="visit-reason" className="mb-1.5 block text-sm font-semibold">Reason for visit (optional)</label>
                <textarea id="visit-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3}
                  placeholder={`Add a short note for ${selectedSlot.professional_name}, such as what you would like to discuss.`}
                  className={`${CONTROL} w-full`} />
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button type="submit" loading={busy}>{busy ? "Confirming…" : "Confirm booking"}</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => navigate(back)}>Back</Button>
                </div>
              </form>
            ) : <p className="mt-4 text-muted">This time is unavailable. Choose a different time to continue.</p>}
          </section>
          <aside className="appt-card space-y-3 p-6 text-muted">
            <h2 className="flex items-center gap-2.5 font-semibold text-ink"><Icon name="info" />What happens next</h2>
            <p>Your appointment appears in your list straight away.</p>
            <p>You can cancel any time before it starts. The time then opens up again for other patients.</p>
            <p>Times in the past and times someone else has booked cannot be selected.</p>
          </aside>
        </div>
      ) : (
        <section className="appt-card grid overflow-hidden xl:min-h-[584px] xl:grid-cols-[minmax(210px,1fr)_minmax(350px,1.82fr)_minmax(250px,1.14fr)]">
          <aside className="space-y-4 p-6 xl:border-r xl:border-line">
            {name && <><Avatar name={name} large /><h2 className="text-xl font-semibold">{name}</h2><p className="text-sm text-muted">Your assigned health professional</p></>}
            {professionals.length > 1 && <Field id="booking-professional" label="Health professional" value={activeProfessional}
              options={professionals.map(([value, label]) => ({ value, label }))}
              onChange={(event) => { setProfessionalId(event.target.value || null); setDay(null); setMonth(null); chooseSlot(null); }} />}
            {firstSlot && (
              <>
                <p className="flex items-center gap-2 text-muted"><Icon name="clock-small" />{duration(activeSlot ?? firstSlot)}-minute visit</p>
                <p className="flex items-center gap-2 text-muted"><Icon name="pin-small" />{(activeSlot ?? firstSlot).location}</p>
              </>
            )}
            <ol className="mt-8 space-y-3 text-sm">
              <li className="flex items-center gap-2.5 font-semibold" aria-current="step"><span className="grid size-7 place-items-center rounded-full bg-primary text-white">1</span>Choose date &amp; time</li>
              <li className="flex items-center gap-2.5 text-muted"><span className="grid size-7 place-items-center rounded-full border border-field">2</span>Confirm</li>
            </ol>
          </aside>
          <div className="flex items-center border-y border-line p-6 xl:border-y-0 xl:border-r">
            <MonthCalendar month={activeMonth} onMonth={setMonth} selected={activeDay} slots={relevantSlots}
              onSelect={(key) => { setDay(key); chooseSlot(null); }} />
          </div>
          <div className="flex flex-col gap-3 p-6">
            <div>
              <h2 className="font-semibold">{formatDate(localDate(activeDay), DATE_DAY)}</h2>
              <p className="mt-1 text-sm text-muted">{times.filter((slot) => !slot.booked).length} times available{times.length > 0 && times.every((slot) => duration(slot) === duration(times[0])) ? ` · ${duration(times[0])} minutes each` : ""}</p>
            </div>
            {times.map((slot) => (
              <button key={slot.id} type="button" disabled={slot.booked} aria-pressed={slot.id === activeSlot?.id}
                onClick={() => chooseSlot(slot.id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent ${slot.booked ? "border-line bg-canvas text-muted" : slot.id === activeSlot?.id ? "border-primary bg-primary text-white" : "border-field hover:bg-primary-tint"}`}>
                {slot.id === activeSlot?.id && <Icon name="selected" />}{formatTime(slot.starts_at)}
                {slot.booked && <span className="ml-auto text-sm font-normal">Booked</span>}
              </button>
            ))}
            {!times.length && <p className="text-muted">No times are available for this day.</p>}
            <Button className="mt-1 w-full" disabled={!activeSlot}
              onClick={() => navigate(`${APPOINTMENTS}/book/${activeSlot.id}/confirm`)}>Continue</Button>
          </div>
        </section>
      )}
    </>
  );
}

function AvailabilityDrawer({ day, onClose, onSave, busy, error }) {
  const [date, setDate] = useState(day);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("12:00");
  const [length, setLength] = useState(30);
  const [location, setLocation] = useState("");
  const [validation, setValidation] = useState("");
  const begins = new Date(`${date}T${start}`);
  const finishes = new Date(`${date}T${end}`);
  const count = (finishes - begins) / (60000 * length);
  const validWindow = Number.isInteger(count) && count > 0
    && begins.toTimeString().slice(0, 5) === start
    && finishes.toTimeString().slice(0, 5) === end;

  function submit(event) {
    event.preventDefault();
    if (!validWindow || dateKey(begins) !== date || !location.trim()) {
      setValidation("Enter a location and a time window that divides into whole slots.");
      return;
    }
    if (begins <= new Date()) {
      setValidation("Choose a start time in the future.");
      return;
    }
    setValidation("");
    onSave({
      starts_at: begins.toISOString(), ends_at: finishes.toISOString(),
      duration_minutes: length, location,
    }, date);
  }

  return (
    <Dialog title="Add availability" drawer onClose={onClose} busy={busy}>
      <form className="mt-5 flex min-h-[calc(100%-4rem)] flex-col gap-5" onSubmit={submit}>
        <p className="text-muted">Choose a day and a time window. It is split into bookable slots for your assigned patients.</p>
        {(validation || error) && <Banner title={validation || error} />}
        <Field id="availability-date" label="Date" type="date" required value={date}
          min={dateKey(new Date())} hint="Choose today or a later date. Times use your device’s time zone."
          onChange={(event) => setDate(event.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Field id="availability-start" label="Start time" type="time" required value={start}
            hint="First slot starts" onChange={(event) => setStart(event.target.value)} />
          <Field id="availability-end" label="End time" type="time" required value={end}
            hint="Last slot ends" onChange={(event) => setEnd(event.target.value)} />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Slot length</legend>
          <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4">
            {[15, 30, 45, 60].map((value) => (
              <label key={value} className="cursor-pointer">
                <input className="peer sr-only" type="radio" name="slot-length" checked={length === value} onChange={() => setLength(value)} />
                <span className="block rounded-xl border border-field py-2.5 text-center text-sm font-medium peer-checked:border-primary peer-checked:bg-primary peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">{value} min</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field id="availability-location" label="Location" required maxLength={200} value={location}
          hint="Patients see this on their appointment." onChange={(event) => setLocation(event.target.value)} />
        <p className="flex items-start gap-3 rounded-2xl bg-primary-tint p-4">
          <Icon name="info" />
          <span>{validWindow
            ? `This creates ${count} open ${count === 1 ? "slot" : "slots"} between ${formatTime(begins)} and ${formatTime(finishes)}. Times that overlap existing slots are rejected.`
            : "Choose a time window that divides into whole slots."}</span>
        </p>
        <div className="mt-auto flex flex-wrap gap-3 pt-4">
          <Button type="submit" className="flex-1" loading={busy}>{busy ? "Saving…" : "Save availability"}</Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Dialog>
  );
}

function Availability({ slots, bookings, day, month, onDay, onMonth, onCancel, onRemove }) {
  const times = slots.filter((slot) => dateKey(slot.starts_at) === day);
  const booked = times.filter((slot) => slot.booked).length;
  const bySlot = new Map(bookings.filter((booking) => booking.status === "booked").map((booking) => [booking.slot.id, booking]));
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[0.78fr_1fr]">
      <section className="appt-card p-6">
        <MonthCalendar month={month} onMonth={onMonth} selected={day} onSelect={onDay} slots={slots} professional />
      </section>
      <section className="appt-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-5">
          <h2 className="text-xl font-semibold">{formatDate(localDate(day), DATE_DAY)}</h2>
          <div className="flex gap-2 text-sm">
            <span className="rounded-full bg-primary-tint px-3 py-1 text-primary-dark">{times.length - booked} open</span>
            <span className="rounded-full bg-ok-bg px-3 py-1 text-ok-text">{booked} booked</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="appt-table">
            <thead><tr><th scope="col">Time</th><th scope="col">Status</th><th scope="col">Patient</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {times.map((slot) => {
                const booking = bySlot.get(slot.id);
                return (
                  <tr key={slot.id}>
                    <td className="whitespace-nowrap font-medium">{timeRange(slot)}</td>
                    <td><Badge status={slot.booked ? "booked" : "open"} /></td>
                    <td>{booking?.patient_name ?? "—"}</td>
                    <td>{slot.booked
                      ? booking && <TextAction icon="cancel" danger onClick={() => onCancel(booking)}>Cancel</TextAction>
                      : <TextAction icon="remove" onClick={() => onRemove(slot)}>Remove</TextAction>}</td>
                  </tr>
                );
              })}
              {!times.length && <tr><td colSpan={4} className="text-muted">No availability for this day.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function CancelDialog({ booking, professional, onClose, onConfirm, busy, error }) {
  const { slot } = booking;
  return (
    <Dialog title="Cancel this appointment?" onClose={onClose} busy={busy}>
      <p className="my-5 text-muted">{professional
        ? `You are about to cancel the visit with ${booking.patient_name}. It will show as cancelled in their appointment list.`
        : `You are about to cancel your visit with ${slot.professional_name}. This cannot be undone, but you can book a new time at any point.`}</p>
      <div className="space-y-3 rounded-2xl bg-canvas p-4 font-medium">
        {professional && <p className="flex items-center gap-3"><Icon name="dialog-person" />{booking.patient_name}</p>}
        <p className="flex items-center gap-3"><Icon name="dialog-date" />{formatDate(slot.starts_at)}</p>
        <p className="flex items-center gap-3"><Icon name="dialog-time" />{timeRange(slot)}</p>
        <p className="flex items-center gap-3"><Icon name="dialog-pin" />{slot.location}</p>
      </div>
      <p className="my-5 flex items-start gap-2 text-sm text-muted"><Icon name="dialog-info" />{professional
        ? "This time is not reopened automatically. Add availability again if you want to offer it to other patients."
        : "The time opens up again for other patients to book."}</p>
      {error && <Banner title={error} />}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button variant="secondary" disabled={busy} onClick={onClose}>Keep appointment</Button>
        <Button className={DANGER} loading={busy} onClick={onConfirm}>{busy ? "Cancelling…" : "Cancel appointment"}</Button>
      </div>
    </Dialog>
  );
}

export default function Appointments({ professional = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirming = useMatch(`${APPOINTMENTS}/book/:slotId/confirm`);
  const choosing = useMatch(`${APPOINTMENTS}/book`);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [day, setDay] = useState(null);
  const [month, setMonth] = useState(null);
  const [tab, setTab] = useState(location.state?.tab ?? "availability"); // the session notes page links back to "appointments"
  const [drawer, setDrawer] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [removing, setRemoving] = useState(null);
  const pageTitle = professional ? "Schedule" : confirming ? "Confirm your appointment" : choosing ? "Book an appointment" : "Appointments";
  usePageTitle(pageTitle);

  const refresh = useCallback((ignore = () => false) =>
    Promise.all([api("/appointments/slots"), api("/appointments")]).then(
      ([slots, bookings]) => {
        if (!ignore()) { setData({ slots, bookings }); setLoadError(""); }
      },
      (err) => { if (!ignore()) setLoadError(err.message); },
    ), []);

  useEffect(() => {
    let cancelled = false;
    refresh(() => cancelled);
    return () => { cancelled = true; };
  }, [refresh]);

  async function mutate(path, options, success, onSuccess, refreshOnConflict = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, options);
      onSuccess?.();
      setNotice(success);
      await refresh();
    } catch (err) {
      setError(err.message);
      if (refreshOnConflict && [404, 409].includes(err.status)) await refresh();
    } finally {
      setBusy(false);
    }
  }

  function selectForCancel(booking) {
    setError("");
    setCancelling(booking);
  }

  const slots = data?.slots ?? [];
  const bookings = data?.bookings ?? [];
  const activeDay = day ?? dateKey(slots[0]?.starts_at ?? new Date());
  const activeMonth = month ?? localDate(activeDay);
  const bookingStep = confirming || choosing;

  return (
    <>
      {!bookingStep && (
        <PageHeading title={pageTitle}
          subtitle={professional ? "Create open time slots so your assigned patients can book a time." : "Book and review visits with your care team."}
          action={professional
            ? <Button onClick={() => { setError(""); setDrawer(true); }}>Add availability</Button>
            : <Link to={`${APPOINTMENTS}/book`} onClick={() => { setError(""); setNotice(""); setSelectedId(null); }}
                className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-white hover:bg-primary-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent">Book appointment</Link>}
        />
      )}
      {notice && !bookingStep && <Banner title={notice} tone="ok" />}
      {loadError && <div className="space-y-3"><Banner title={loadError} /><Button variant="secondary" onClick={() => refresh()}>Retry</Button></div>}
      {!data && !loadError && <p role="status" className="text-muted">Loading appointments…</p>}
      {data && bookingStep && (
        <BookingSteps
          slots={slots} confirming={Boolean(confirming)} busy={busy} error={error}
          selectedSlot={slots.find((slot) => slot.id === (confirming?.params.slotId ?? selectedId))}
          chooseSlot={(id) => { setError(""); setSelectedId(id); }}
          onBook={(slot, reason) => mutate(`/appointments/slots/${slot.id}/book`, { method: "POST", body: { reason } },
            "Appointment booked.", () => navigate(APPOINTMENTS), true)}
        />
      )}
      {data && !bookingStep && professional && (
        <>
          <div className="flex flex-wrap gap-1 self-start rounded-full bg-canvas p-1" aria-label="Schedule views">
            {[["availability", "Availability"], ["appointments", "Appointments"]].map(([value, label]) => (
              <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-3 focus-visible:outline-accent ${tab === value ? "bg-card shadow-[0_0_0_1px_var(--color-line)]" : "text-muted hover:bg-card"}`}>{label}</button>
            ))}
          </div>
          {tab === "availability"
            ? <Availability slots={slots} bookings={bookings} day={activeDay} month={activeMonth} onDay={setDay} onMonth={setMonth}
                onCancel={selectForCancel} onRemove={(slot) => { setError(""); setRemoving(slot); }} />
            : <BookingTable bookings={bookings} professional onCancel={selectForCancel} />}
        </>
      )}
      {data && !bookingStep && !professional && (
        <>
          <NextAppointment booking={bookings.find(canCancel)} onCancel={selectForCancel} />
          <BookingTable bookings={bookings} onCancel={selectForCancel} />
        </>
      )}
      {drawer && (
        <AvailabilityDrawer day={activeDay} busy={busy} error={error} onClose={() => setDrawer(false)}
          onSave={(payload, date) => mutate("/appointments/slots", { method: "POST", body: payload },
            "Availability added.", () => { setDrawer(false); setDay(date); setMonth(localDate(date)); setTab("availability"); })} />
      )}
      {cancelling && (
        <CancelDialog booking={cancelling} professional={professional} busy={busy} error={error}
          onClose={() => setCancelling(null)}
          onConfirm={() => mutate(`/appointments/bookings/${cancelling.id}`, { method: "DELETE" },
            "Appointment cancelled.", () => setCancelling(null), true)} />
      )}
      {removing && (
        <Dialog title="Remove this open time?" busy={busy} onClose={() => setRemoving(null)}>
          <p className="my-5 text-muted">{formatDate(removing.starts_at)} · {timeRange(removing)}</p>
          {error && <Banner title={error} />}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>Keep time</Button>
            <Button className={DANGER} loading={busy}
              onClick={() => mutate(`/appointments/slots/${removing.id}`, { method: "DELETE" },
                "Availability removed.", () => setRemoving(null), true)}>Remove time</Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
