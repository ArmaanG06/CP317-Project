import { Search, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import usePageTitle from "../lib/usePageTitle";
import { formatWhen } from "../lib/vitals";

// MON-1-T1: shows only the patients assigned to the signed-in professional. The server does the filtering.
// MON-1-T2: each entry links to that patient's dashboard route, as given by the API (dashboard_path).
// Layout follows Figma frame "07 · Professional – My patients".

const initials = (name) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

// Newest reading time across all vitals, or null when the patient has none.
function lastReading(latest) {
  const times = latest.filter((r) => r.available).map((r) => r.recorded_at);
  return times.length ? times.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
}

// e.g. "HR 72 · BP 128/82 · 36.8 °C", leaving out vitals with no reading.
function vitalsSummary(latest) {
  const by = Object.fromEntries(latest.filter((r) => r.available).map((r) => [r.vital_type, r.value]));
  const parts = [];
  if (by.heart_rate != null) parts.push(`HR ${by.heart_rate}`);
  if (by.systolic != null && by.diastolic != null) parts.push(`BP ${by.systolic}/${by.diastolic}`);
  if (by.temperature != null) parts.push(`${by.temperature.toFixed(1)} °C`);
  if (by.spo2 != null && parts.length < 3) parts.push(`SpO2 ${by.spo2}%`);
  return parts.join(" · ");
}

export default function ProfessionalRoster() {
  usePageTitle("My patients");
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
  const count = patients?.length ?? 0;
  const shown = (patients ?? []).filter((p) => p.full_name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">My patients</h1>
        <p className="text-muted">
          {patients && count > 0
            ? `${count} ${count === 1 ? "patient is" : "patients are"} assigned to you. Select a patient to review their readings.`
            : "Patients assigned to you. Select a patient to review their readings."}
        </p>
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

      {count > 0 && (
        <>
          <div className="relative w-full max-w-[360px]">
            <label htmlFor="patient-search" className="sr-only">Search patients by name</label>
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            <input
              id="patient-search"
              type="search"
              placeholder="Search patients by name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 w-full rounded-xl border border-field bg-card pr-4 pl-11 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent"
            />
          </div>

          <section className="overflow-hidden rounded-[20px] border border-line bg-card shadow-card">
            <table className="w-full text-left">
              <caption className="sr-only">Assigned patients</caption>
              <thead className="bg-canvas text-sm text-muted">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Patient</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last reading</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Latest vitals</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((p) => {
                  const last = lastReading(p.latest ?? []);
                  const vitals = vitalsSummary(p.latest ?? []);
                  return (
                    <tr key={p.patient_id}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
                            {initials(p.full_name)}
                          </span>
                          <div>
                            <p className="font-semibold">{p.full_name}</p>
                            <p className="text-sm text-muted">
                              Assigned {new Date(p.assigned_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className={`px-4 py-4 ${last ? "" : "text-muted"}`}>{last ? formatWhen(last) : "No readings yet"}</td>
                      <td className="px-4 py-4 tabular-nums">{vitals || <span className="text-muted">—</span>}</td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={p.dashboard_path}
                          aria-label={`Open ${p.full_name}`}
                          className="inline-flex h-10 items-center rounded-full border-2 border-primary bg-card px-5 font-medium text-primary-dark hover:bg-primary-tint focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {shown.length === 0 && (
              <p role="status" className="px-6 py-8 text-center text-muted">No patients match “{query.trim()}”.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}
