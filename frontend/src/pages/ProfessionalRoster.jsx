import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiGet } from "../api.js";

// MON-1-T1: shows only the patients assigned to the signed-in professional (filtered on the server).
// MON-1-T2: each entry links to that patient's dashboard route, as given by the API.
export default function ProfessionalRoster() {
  const [state, setState] = useState({ status: "loading", patients: [] });

  useEffect(() => {
    let cancelled = false;
    apiGet("/professionals/me/patients")
      .then((patients) => !cancelled && setState({ status: "ready", patients }))
      .catch((error) => !cancelled && setState({ status: "error", patients: [], code: error.status }));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>My patients</h1>

      {state.status === "loading" && <p role="status">Loading patients…</p>}

      {state.status === "error" && (
        <p role="alert">
          {state.code === 403
            ? "Only health professionals can view a patient roster."
            : "Could not load your patients. Please try again."}
        </p>
      )}

      {state.status === "ready" && state.patients.length === 0 && (
        <p>No patients are assigned to you yet.</p>
      )}

      {state.status === "ready" && state.patients.length > 0 && (
        <ul aria-label="Assigned patients" className="roster">
          {state.patients.map((p) => (
            <li key={p.patient_id}>
              <Link to={p.dashboard_path}>{p.full_name}</Link>
              <span className="muted"> · assigned {new Date(p.assigned_at).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
