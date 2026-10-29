import { Navigate, Route, Routes } from "react-router-dom";

import PatientLayout from "./components/PatientLayout.jsx";
import PlaceholderPage from "./pages/PlaceholderPage.jsx";
import ProfessionalRoster from "./pages/ProfessionalRoster.jsx";

// Route paths shared with the backend (monitoring.py patient_dashboard_path) and the nav.
export const ROUTES = {
  dashboard: "/dashboard",
  newReading: "/readings/new",
  history: "/history",
  appointments: "/appointments",
  roster: "/roster",
  patientDashboard: "/patients/:patientId",
};

// Pages owned by other stories are placeholders here; swap in the real components as they land.
export default function AppRoutes() {
  return (
    <Routes>
      {/* Patient area: every page gets the UI-2 navigation bar */}
      <Route element={<PatientLayout />}>
        <Route path={ROUTES.dashboard} element={<PlaceholderPage title="Dashboard" story="UI-1" />} />
        <Route path={ROUTES.newReading} element={<PlaceholderPage title="Enter a reading" story="DATA-1" />} />
        <Route path={ROUTES.history} element={<PlaceholderPage title="History" />} />
        <Route path={ROUTES.appointments} element={<PlaceholderPage title="Appointments" />} />
      </Route>

      {/* Professional area (MON-1) */}
      <Route path={ROUTES.roster} element={<ProfessionalRoster />} />
      <Route path={ROUTES.patientDashboard} element={<PlaceholderPage title="Patient dashboard" story="UI-1" />} />

      <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
    </Routes>
  );
}
