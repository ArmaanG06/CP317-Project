import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppShell from "./components/AppShell";
import Appointments from "./pages/Appointments";
import PatientDashboard from "./pages/PatientDashboard";
import ProfessionalAlerts from "./pages/ProfessionalAlerts";
import ProfessionalPatientView from "./pages/ProfessionalPatientView";
import ProfessionalRoster from "./pages/ProfessionalRoster";
import Profile from "./pages/Profile";
import RecordVitals from "./pages/RecordVitals";
import SignIn from "./pages/SignIn";
import Trends from "./pages/Trends";

// These guards are for navigation only. The real access control is the server's 401 and 403.
function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8">Loading…</p>;
  if (!user) return <Navigate to="/signin" replace />;
  return <Outlet />;
}

function RequireRole({ role }) {
  const { user } = useAuth();
  return user.role === role ? <Outlet /> : <Navigate to="/" replace />;
}

// MON-2: a fresh page per patient, so switching patients never shows the previous patient's data.
function PatientViewForRoute() {
  const { patientId } = useParams();
  return <ProfessionalPatientView key={patientId} />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user.role === "patient" ? "/patient" : "/professional"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route element={<AppShell />}>
          <Route path="/profile" element={<Profile />} />
          <Route element={<RequireRole role="patient" />}>
            <Route path="/patient" element={<PatientDashboard />} />
            <Route path="/patient/record" element={<RecordVitals />} />
            <Route path="/patient/trends" element={<Trends />} />
            <Route path="/patient/appointments/*" element={<Appointments key="patient" />} />
          </Route>
          <Route element={<RequireRole role="professional" />}>
            <Route path="/professional" element={<ProfessionalRoster />} />
            <Route path="/professional/alerts" element={<ProfessionalAlerts />} />
            <Route path="/professional/patients/:patientId" element={<PatientViewForRoute />} />
            <Route path="/professional/schedule" element={<Appointments key="professional" professional />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
