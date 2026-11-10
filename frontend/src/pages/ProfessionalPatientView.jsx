import { ArrowLeft, Flag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
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
  usePageTitle(name || "Patient");

  const fetchPatient = useCallback(() => {
    return Promise.all([api("/professionals/me/patients"), api(`/patients/${patientId}/readings/latest`)])
      .then(([patients, readings]) => {
        setRoster(patients);
        setName(patients.find((p) => p.patient_id === patientId)?.full_name ?? "Patient");
        setRows(readings);
      })
      .catch((e) =>
        setError(e.status === 403 ? "This patient isn’t assigned to you, so their records aren’t available." : e.message)
      );
  }, [patientId]);
  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  const retry = () => {
    setError("");
    setRows(null);
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
        className="inline-flex items-center gap-2 self-start rounded-full font-medium text-primary-dark hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Back to my patients
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">{loading ? "Loading patient…" : error ? "Patient" : name}</h1>
          <p className="text-muted">Latest readings, trends and flags.</p>
        </div>
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

          {/* ALT-2 placeholder: automatic flags plug in here once readings are checked against thresholds. */}
          <section aria-labelledby="flags-heading" className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <h2 id="flags-heading" className="flex items-center gap-2.5 text-xl font-semibold">
                <Flag size={22} aria-hidden="true" className="text-primary" />
                Flagged readings
              </h2>
              <span className="rounded-full bg-warn-bg px-3 py-1 text-sm text-warn-text">Coming soon</span>
            </div>
            <p className="text-muted">
              Readings outside this patient’s thresholds will be listed here automatically once reading flags are
              available.
            </p>
            <p className="text-sm text-muted">Flags are a monitoring aid, not a diagnosis.</p>
          </section>
        </>
      )}
    </>
  );
}
