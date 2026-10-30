import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import VitalCard from "../components/VitalCard";
import usePageTitle from "../lib/usePageTitle";
import { buildCards } from "../lib/vitals";

// MON-1-T2: the page a roster entry links to. Shows one assigned patient's latest readings.
// The server returns 403 if this professional isn't assigned to the patient (AUTH-2).
export default function ProfessionalPatientView() {
  const { patientId } = useParams();
  const [name, setName] = useState("");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  usePageTitle(name || "Patient");

  const fetchPatient = useCallback(() => {
    return Promise.all([api("/professionals/me/patients"), api(`/patients/${patientId}/readings/latest`)])
      .then(([roster, readings]) => {
        setName(roster.find((p) => p.patient_id === patientId)?.full_name ?? "Patient");
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

      <div>
        <h1 className="text-[28px] leading-9 font-bold">{loading ? "Loading patient…" : error ? "Patient" : name}</h1>
        <p className="text-muted">Latest saved readings.</p>
      </div>

      {error && (
        <Banner title="We couldn’t load this patient">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={retry}>Try again</Button>
        </Banner>
      )}

      {!error && (
        <div aria-busy={loading} className="grid grid-cols-4 gap-5">
          {buildCards(rows).map((c) => (
            <VitalCard key={c.label} {...c} loading={loading} />
          ))}
        </div>
      )}
    </>
  );
}
