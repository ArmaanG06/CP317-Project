import { Bell, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import usePageTitle from "../lib/usePageTitle";
import { flagText } from "../lib/vitals";

const SELECT = "h-12 w-full rounded-xl border border-field bg-card px-4 text-ink focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent";

export default function ProfessionalAlerts() {
  usePageTitle("Alerts");
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState("");

  useEffect(() => {
    api("/professionals/me/patients").then(setPatients).catch(() => {});
  }, []);

  const loadAlerts = useCallback(() => {
    const params = new URLSearchParams({ status: reviewStatus });
    if (patientId) params.set("patient_id", patientId);
    return api(`/professionals/me/alerts?${params}`).then(setResult).catch((e) => setError(e.message));
  }, [patientId, reviewStatus]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const retry = () => {
    setError("");
    setResult(null);
    loadAlerts();
  };

  const changePatient = (event) => {
    setResult(null);
    setError("");
    setPatientId(event.target.value);
  };

  const changeStatus = (event) => {
    setResult(null);
    setError("");
    setReviewStatus(event.target.value);
  };

  const review = async (id) => {
    setBusyId(id);
    setActionError("");
    try {
      await api(`/professionals/me/alerts/${id}/review`, { method: "PATCH" });
      await loadAlerts();
      window.dispatchEvent(new Event("alerts:changed"));
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const loading = result === null && !error;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">Alerts</h1>
          <p className="text-muted">Flagged readings from patients assigned to you.</p>
        </div>
        {result && (
          <p role="status" className="rounded-full bg-warn-bg px-4 py-2 font-semibold text-warn-text">
            {result.unreviewed_count} unreviewed across all patients
          </p>
        )}
      </div>

      <div className="grid max-w-2xl grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-patient" className="text-sm font-semibold">Patient</label>
          <select id="alert-patient" value={patientId} onChange={changePatient} className={SELECT}>
            <option value="">All patients</option>
            {patients.map((patient) => (
              <option key={patient.patient_id} value={patient.patient_id}>{patient.full_name}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-status" className="text-sm font-semibold">Review status</label>
          <select id="alert-status" value={reviewStatus} onChange={changeStatus} className={SELECT}>
            <option value="all">All alerts</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </div>
      </div>

      {error && (
        <Banner title="We couldn’t load alerts">
          {error}{" "}<Button variant="secondary" className="mt-2 h-10" onClick={retry}>Try again</Button>
        </Banner>
      )}
      {actionError && <Banner title="We couldn’t review this alert">{actionError}</Banner>}
      {loading && <p role="status" className="text-muted">Loading alerts…</p>}

      {result?.alerts.length === 0 && (
        <section className="rounded-[20px] border border-line bg-card p-8 text-center shadow-card">
          <h2 className="text-xl font-semibold">No alerts match these filters</h2>
          <p className="mt-2 text-muted">Try another patient or review status.</p>
        </section>
      )}

      {result?.alerts.length > 0 && (
        <section aria-label="Patient alerts" className="rounded-[20px] border border-line bg-card shadow-card">
          <ul className="divide-y divide-line">
            {result.alerts.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-start justify-between gap-4 p-5">
                <div className="flex min-w-0 items-start gap-3">
                  <Bell size={20} aria-hidden="true" className="mt-1 shrink-0 text-warn-text" />
                  <div>
                    <p className="font-semibold">{alert.patient_name}</p>
                    <p>{flagText(alert.vital_type, alert.value, alert)}</p>
                    <time dateTime={alert.recorded_at} className="text-sm text-muted">
                      {new Date(alert.recorded_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </time>
                  </div>
                </div>
                {alert.reviewed_at ? (
                  <span className="flex items-center gap-1 rounded-full bg-ok-bg px-3 py-1 text-sm font-medium text-ok-text">
                    <Check size={16} aria-hidden="true" /> Reviewed
                  </span>
                ) : (
                  <Button variant="secondary" className="h-10" loading={busyId === alert.id} onClick={() => review(alert.id)}>
                    {busyId === alert.id ? "Saving…" : "Mark reviewed"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted">Alerts are monitoring aids, not diagnoses. Reviewing an alert keeps its reading and flag in history.</p>
    </>
  );
}
