import { NavLink } from "react-router-dom";

// UI-2-T1: links the patient's main pages. One click reaches any page from any page.
export const PATIENT_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/readings/new", label: "Enter reading" },
  { to: "/history", label: "History" },
  { to: "/appointments", label: "Appointments" },
];

export default function PatientNav() {
  return (
    <nav aria-label="Patient navigation" className="patient-nav">
      <ul>
        {PATIENT_LINKS.map(({ to, label }) => (
          <li key={to}>
            {/* NavLink sets aria-current="page" on the active link, so screen readers announce the current page.
                The "active" class gives sighted users the same cue. */}
            <NavLink to={to} className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
