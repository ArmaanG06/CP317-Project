import { Calendar, ChartLine, Users } from "lucide-react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import AppShell from "./components/AppShell";
import ComingSoon from "./pages/ComingSoon";
import PatientDashboard from "./pages/PatientDashboard";
import RecordVitals from "./pages/RecordVitals";
import SignIn from "./pages/SignIn";

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
          <Route element={<RequireRole role="patient" />}>
            <Route path="/patient" element={<PatientDashboard />} />
            <Route path="/patient/record" element={<RecordVitals />} />
            <Route
              path="/patient/trends"
              element={
                <ComingSoon
                  title="Trends & history"
                  subtitle="See how your readings change over time."
                  Icon={ChartLine}
                  message="Trend charts with a time filter and written summaries will appear on this page in an upcoming sprint."
                />
              }
            />
            <Route
              path="/patient/appointments"
              element={
                <ComingSoon
                  title="Appointments"
                  subtitle="Book and review visits with your care team."
                  Icon={Calendar}
                  message="Booking and cancelling appointments with your assigned health professional will appear here in an upcoming sprint."
                />
              }
            />
          </Route>
          <Route element={<RequireRole role="professional" />}>
            <Route
              path="/professional"
              element={
                <ComingSoon
                  title="My patients"
                  subtitle="Review the patients assigned to you."
                  Icon={Users}
                  message="Your patient roster will appear here once the backend can tell which patients are assigned to you."
                />
              }
            />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
