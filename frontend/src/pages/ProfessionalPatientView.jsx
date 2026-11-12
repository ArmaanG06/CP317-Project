import { ArrowLeft, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
import FlaggedReadings from "../components/FlaggedReadings";
import TrendsPanel from "../components/TrendsPanel";
import VitalCard from "../components/VitalCard";
import usePageTitle from "../lib/usePageTitle";
import { buildCards } from "../lib/vitals";

// MON-1-T2: the page a roster entry links to. MON-2: one assigned patient's latest readings, trends and flags.
// The server returns 403 if this professional isn't assigned to the patient (AUTH-2).
// App.jsx remounts this page per patient (key={patientId}), so switching patients never shows stale data.
export default function ProfessionalPatientView() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [roster, setRoster] = useState([]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [flagRows, setFlagRows] = useState(null);
  const [flagError, setFlagError] = useState("");
  usePageTitle(name || "Patient");

  const fetchFlags = useCallback(() => {
    setFlagError("");
    setFlagRows(null);
    api(`/patients/${patientId}/readings/flags`).then(setFlagRows).catch((e) => setFlagError(e.message));
  }, [patientId]);

  const fetchPatient = useCallback(() => {
    return Promise.all([api("/professionals/me/patients"), api(`/patients/${patientId}/readings/latest`)])
      .then(([patients, readings]) => {
        setRoster(patients);
        setName(patients.find((p) => p.patient_id === patientId)?.full_name ?? "Patient");
        setRows(readings);
        fetchFlags();
      })
      .catch((e) =>
        setError(e.status === 403 ? "This patient isn’t assigned to you, so their records aren’t available." : e.message)
      );
  }, [patientId, fetchFlags]);
  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  const retry = () => {
    setError("");
    setRows(null);
    setFlagRows(null);
    setFlagError("");
    fetchPatient();
  };

  const switchPatient = (e) => {
    const next = roster.find((p) => p.patient_id === e.target.value);
    if (next) navigate(next.dashboard_path);
  };

  const loading = rows === null && !error;

  return (
    <>
      <Link
        to="/professional"
        className="inline-flex items-center gap-1.5 self-start rounded-full text-sm font-medium text-accent hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        My patients
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">{loading ? "Loading patient…" : error ? "Patient" : name}</h1>
          <p className="text-muted">{error ? "Latest readings, trends and flags." : "Assigned to you · Latest readings, trends and flags."}</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {!error && (
            <span className="mb-3 rounded-full bg-ok-bg px-3 py-1 text-sm text-ok-text">All readings are patient-entered</span>
          )}
          {roster.length > 1 && (
          <div className="w-72">
            <Field
              id="switch-patient"
              label="Switch patient"
              value={patientId}
              onChange={switchPatient}
              options={roster.map((p) => ({ value: p.patient_id, label: p.full_name }))}
            />
          </div>
          )}
        </div>
      </div>

      {error && (
        <Banner title="We couldn’t load this patient">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={retry}>Try again</Button>
        </Banner>
      )}

      {!error && (
        <>
          <section aria-labelledby="latest-heading" className="flex flex-col gap-3">
            <h2 id="latest-heading" className="text-xl font-semibold">Latest readings</h2>
            <div aria-busy={loading} className="grid grid-cols-4 gap-5">
              {buildCards(rows).map((c) => (
                <VitalCard key={c.label} {...c} loading={loading} />
              ))}
            </div>
          </section>

          <TrendsPanel historyPath={`/patients/${patientId}/readings/history`} />

          <div className="grid grid-cols-[1fr_380px] items-start gap-5">
            <FlaggedReadings headingId="flags-heading" rows={flagRows} error={flagError} onRetry={fetchFlags} />
            <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
              <h2 className="flex items-center gap-2.5 text-base font-semibold">
                <Info size={24} aria-hidden="true" className="text-primary" />
                Interpreting readings
              </h2>
              <p className="text-muted">
                Values are entered by the patient at home. Home devices can vary in accuracy, so use clinical judgment
                alongside these readings.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
