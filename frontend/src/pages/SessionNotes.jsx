import { ArrowLeft, Calendar, Clock, Eye, Lock, MapPin, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { Avatar, Badge, Dialog } from "../components/AppointmentUI";
import Banner from "../components/Banner";
import Button from "../components/Button";
import { formatDate, formatTime, SCHEDULE, timeRange } from "../lib/appointments";
import usePageTitle from "../lib/usePageTitle";
import { buildCards } from "../lib/vitals";

// Session notes for one visit (Figma frames 17–19). Notes for the patient stay a draft until published;
// internal notes are only ever visible to health professionals.
const BOX =
  "min-h-44 w-full rounded-xl border border-field bg-card p-4 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent";
const firstName = (name) => name.split(" ")[0];
const savedAt = (iso) => (iso ? `${formatDate(iso, { month: "short", day: "numeric" })}, ${formatTime(iso)}` : null);

function StatusPill({ visit }) {
  if (visit.notes_published) return <span className="rounded-full bg-ok-bg px-3 py-1 text-sm text-ok-text">Published</span>;
  if (visit.shared_notes) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-3 py-1 text-sm text-warn-text">
        <Pencil size={14} aria-hidden="true" />Draft, not shared
      </span>
    );
  }
  return <span className="rounded-full border border-line bg-canvas px-3 py-1 text-sm text-muted">No notes yet</span>;
}

export default function SessionNotes() {
  const { bookingId } = useParams();
  usePageTitle("Session notes");
  const [visit, setVisit] = useState(null);
  const [latest, setLatest] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [shared, setShared] = useState("");
  const [internal, setInternal] = useState("");
  const [busy, setBusy] = useState(null); // "draft" | "publish" | "internal"
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);

  const show = (data) => {
    setVisit(data);
    setShared(data.shared_notes ?? "");
    setInternal(data.internal_notes ?? "");
  };

  const fetchVisit = useCallback(
    () =>
      api(`/appointments/bookings/${bookingId}`)
        .then((data) => {
          show(data);
          return api(`/patients/${data.patient_id}/readings/latest`).then(setLatest).catch(() => setLatest([]));
        })
        .catch((e) => setLoadError(e.message)),
    [bookingId]
  );
  useEffect(() => {
    fetchVisit();
  }, [fetchVisit]);

  async function save(kind, body, success) {
    setBusy(kind);
    setError("");
    setNotice("");
    try {
      const data = await api(`/appointments/bookings/${bookingId}/notes`, { method: "PUT", body });
      // Keep whatever is typed in the other box; only the saved box is replaced with the server's copy.
      setVisit(data);
      if (kind === "internal") setInternal(data.internal_notes ?? "");
      else setShared(data.shared_notes ?? "");
      setNotice(success);
      setConfirming(false);
    } catch (e) {
      setError(e.fieldErrors?.[0]?.message ?? e.message);
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link
      to={SCHEDULE}
      state={{ tab: "appointments" }}
      className="inline-flex items-center gap-1.5 self-start rounded-full text-sm font-medium text-accent hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowLeft size={16} aria-hidden="true" />Appointments
    </Link>
  );

  if (loadError) {
    return (
      <>
        {back}
        <Banner title="We couldn’t load this appointment">{loadError}</Banner>
      </>
    );
  }
  if (!visit) return <p role="status" className="text-muted">Loading session notes…</p>;

  const name = firstName(visit.patient_name);
  const editable = visit.status === "completed";
  const sharedChanged = shared.trim() !== (visit.shared_notes ?? "");
  const vitals = latest ? buildCards(latest) : [];

  return (
    <>
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">Session notes</h1>
          <p className="text-muted">
            Notes for {visit.patient_name}’s visit. Patients only see the shared notes, and only after you publish them.
          </p>
        </div>
        {editable ? <StatusPill visit={visit} /> : <Badge status={visit.status} />}
      </div>

      {notice && <Banner tone="ok" title={notice} />}
      {error && <Banner title={error} />}

      <section aria-label="Visit" className="flex flex-wrap items-center gap-6 rounded-[20px] border border-line bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Avatar name={visit.patient_name} />
          <p className="font-semibold">{visit.patient_name}</p>
        </div>
        <div className="flex flex-col gap-1 border-line text-sm text-muted sm:border-l sm:pl-6">
          <span className="flex items-center gap-2"><Calendar size={16} aria-hidden="true" />{formatDate(visit.slot.starts_at)}</span>
          <span className="flex items-center gap-2"><Clock size={16} aria-hidden="true" />{timeRange(visit.slot)}</span>
          <span className="flex items-center gap-2"><MapPin size={16} aria-hidden="true" />{visit.slot.location}</span>
        </div>
        {vitals.length > 0 && (
          <div className="border-line text-sm sm:border-l sm:pl-6">
            <p className="mb-1.5 text-muted">Latest readings, patient-entered</p>
            <dl className="flex flex-wrap gap-x-6 gap-y-1">
              {vitals.map((c) => (
                <div key={c.label}>
                  <dt className="text-muted">{c.label}</dt>
                  <dd className="font-semibold">{c.reading ? `${c.reading.display} ${c.unit}` : "No reading"}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </section>

      {visit.reason && (
        <p className="text-muted"><span className="font-semibold text-ink">Reason for visit: </span>{visit.reason.replace(/^Reason for visit:\s*/, "")}</p>
      )}

      {!editable ? (
        <Banner title={visit.status === "cancelled" ? "This appointment was cancelled" : "This appointment hasn’t happened yet"}>
          {visit.status === "cancelled" ? "Notes can’t be added to a cancelled visit." : "You can write notes once the visit has started."}
        </Banner>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section aria-labelledby="shared-heading" className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
            <h2 id="shared-heading" className="flex items-center gap-2.5 text-base font-semibold">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-tint text-primary"><Eye size={20} aria-hidden="true" /></span>
              Notes for {name}
            </h2>
            <p className="text-sm text-muted">{name} will only see these after you publish them.</p>
            <label htmlFor="shared-notes" className="sr-only">Notes for {name}</label>
            <textarea id="shared-notes" className={BOX} maxLength={5000} value={shared} onChange={(e) => setShared(e.target.value)}
              placeholder={"Summary:\nPlan:\nFollow-up:"} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                {visit.notes_published && !sharedChanged
                  ? `Published ${savedAt(visit.notes_published_at)}`
                  : visit.notes_updated_at ? `Last saved ${savedAt(visit.notes_updated_at)}` : "Not saved yet"}
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" loading={busy === "draft"} disabled={Boolean(busy)}
                  onClick={() => save("draft", { shared_notes: shared }, "Draft saved. It isn’t visible to the patient.")}>
                  Save draft
                </Button>
                <Button disabled={Boolean(busy) || !shared.trim() || (visit.notes_published && !sharedChanged)}
                  onClick={() => { setError(""); setConfirming(true); }}>
                  Publish to patient
                </Button>
              </div>
            </div>
          </section>

          <section aria-labelledby="internal-heading" className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 id="internal-heading" className="flex items-center gap-2.5 text-base font-semibold">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary-tint text-primary"><Lock size={20} aria-hidden="true" /></span>
                Internal notes
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-sm text-muted">
                <Lock size={14} aria-hidden="true" />Internal only
              </span>
            </div>
            <p className="text-sm text-muted">Only health professionals can see these. They are never shown to patients.</p>
            <label htmlFor="internal-notes" className="sr-only">Internal notes</label>
            <textarea id="internal-notes" className={BOX} maxLength={5000} value={internal} onChange={(e) => setInternal(e.target.value)} />
            <div className="flex justify-end">
              <Button variant="secondary" loading={busy === "internal"} disabled={Boolean(busy)}
                onClick={() => save("internal", { internal_notes: internal }, "Internal notes saved.")}>
                Save
              </Button>
            </div>
          </section>
        </div>
      )}

      {confirming && (
        <Dialog title={`Publish notes to ${name}?`} busy={busy === "publish"} onClose={() => setConfirming(false)}>
          <p className="my-5 text-muted">
            {name} will see these notes on their appointment page. Internal notes stay private. If you edit the notes later,
            they go back to draft until you publish again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" disabled={busy === "publish"} onClick={() => setConfirming(false)}>Keep editing</Button>
            <Button loading={busy === "publish"}
              onClick={() => save("publish", { shared_notes: shared, publish: true }, `Notes published. ${name} can now see them.`)}>
              {busy === "publish" ? "Publishing…" : "Publish notes"}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
