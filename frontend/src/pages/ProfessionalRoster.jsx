import { ChevronRight, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import usePageTitle from "../lib/usePageTitle";

// MON-1-T1: shows only the patients assigned to the signed-in professional. The server does the filtering.
// MON-1-T2: each entry links to that patient's dashboard route, as given by the API (dashboard_path).
export default function ProfessionalRoster() {
  usePageTitle("My patients");
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState("");

  const fetchRoster = useCallback(
    () => api("/professionals/me/patients").then(setPatients).catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const retry = () => {
    setError("");
    setPatients(null);
    fetchRoster();
  };

  const loading = patients === null && !error;

  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">My patients</h1>
        <p className="text-muted">Patients assigned to you. Select a patient to see their latest readings.</p>
      </div>

      {error && (
        <Banner title="We couldn’t load your patients">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={retry}>Try again</Button>
        </Banner>
      )}

      {loading && (
        <p role="status" className="text-muted">Loading patients…</p>
      )}

      {patients?.length === 0 && (
        <section className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-card p-12 text-center shadow-card">
          <span className="flex size-[72px] items-center justify-center rounded-full bg-primary-tint text-primary">
            <Users size={32} aria-hidden="true" />
          </span>
          <h2 className="text-xl font-semibold">No patients assigned yet</h2>
          <p className="max-w-md text-muted">Patients will appear here once they are assigned to you.</p>
        </section>
      )}

      {patients?.length > 0 && (
        <section className="rounded-[20px] border border-line bg-card shadow-card">
          <h2 className="sr-only">Assigned patients</h2>
          <ul aria-label="Assigned patients" className="divide-y divide-line">
            {patients.map((p) => (
              <li key={p.patient_id}>
                <Link
                  to={p.dashboard_path}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-primary-tint focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-accent"
                >
                  <span aria-hidden="true" className="flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary">
                    <UserRound size={22} />
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{p.full_name}</span>
                    <span className="block text-sm text-muted">
                      Assigned {new Date(p.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </span>
                  <ChevronRight size={20} aria-hidden="true" className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
