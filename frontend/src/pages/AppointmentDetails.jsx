import { ArrowLeft, Calendar, Clock, Eye, Info, MapPin, User } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Badge } from "../components/AppointmentUI";
import Banner from "../components/Banner";
import { APPOINTMENTS, formatDate, formatTime, timeRange } from "../lib/appointments";
import usePageTitle from "../lib/usePageTitle";

// Patient view of one visit and the notes their professional has published (Figma frame 20).
function Detail({ Icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-tint text-primary">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div>
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="font-medium">{children}</dd>
      </div>
    </div>
  );
}

export default function AppointmentDetails() {
  const { bookingId } = useParams();
  usePageTitle("Appointment details");
  const [visit, setVisit] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/appointments/bookings/${bookingId}`).then(setVisit).catch((e) => setError(e.message));
  }, [bookingId]);

  const back = (
    <Link
      to={APPOINTMENTS}
      className="inline-flex items-center gap-1.5 self-start rounded-full text-sm font-medium text-accent hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowLeft size={16} aria-hidden="true" />Appointments
    </Link>
  );

  if (error) {
    return (
      <>
        {back}
        <Banner title="We couldn’t load this appointment">{error}</Banner>
      </>
    );
  }
  if (!visit) return <p role="status" className="text-muted">Loading appointment…</p>;

  const { slot } = visit;
  const who = visit.professional_name;

  return (
    <>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">Appointment details</h1>
          <p className="text-muted">{formatDate(slot.starts_at)} with {who}</p>
        </div>
        <Badge status={visit.status} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[320px_1fr]">
        <section aria-labelledby="visit-heading" className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <h2 id="visit-heading" className="text-lg font-semibold">Visit details</h2>
          <dl className="flex flex-col gap-4">
            <Detail Icon={Calendar} label="Date">{formatDate(slot.starts_at)}</Detail>
            <Detail Icon={Clock} label="Time">{timeRange(slot)}</Detail>
            <Detail Icon={User} label="With">{who}</Detail>
            <Detail Icon={MapPin} label="Location">{slot.location}</Detail>
          </dl>
          {visit.reason && (
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">Your reason for visit: </span>
              {visit.reason.replace(/^Reason for visit:\s*/, "")}
            </p>
          )}
        </section>

        <section aria-labelledby="notes-heading" className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 id="notes-heading" className="flex items-center gap-2.5 text-base font-semibold">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-tint text-primary"><Eye size={20} aria-hidden="true" /></span>
              Notes from {who}
            </h2>
            {visit.notes_published && <span className="rounded-full bg-ok-bg px-3 py-1 text-sm text-ok-text">Published</span>}
          </div>
          {visit.notes_published ? (
            <>
              <p className="text-sm text-muted">
                Shared by {who} on {formatDate(visit.notes_published_at, { weekday: "long", month: "long", day: "numeric" })} · {formatTime(visit.notes_published_at)}
              </p>
              <p className="whitespace-pre-wrap">{visit.shared_notes}</p>
            </>
          ) : (
            <p className="text-muted">
              {visit.status === "booked"
                ? "Notes are shared after your visit."
                : visit.status === "cancelled"
                  ? "This visit was cancelled, so there are no notes."
                  : `${who} hasn’t shared notes for this visit yet.`}
            </p>
          )}
          <p className="flex items-start gap-2 border-t border-line pt-3 text-sm text-muted">
            <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            These notes summarize your visit and are not a diagnosis. In an emergency, call 911.
          </p>
        </section>
      </div>
    </>
  );
}
