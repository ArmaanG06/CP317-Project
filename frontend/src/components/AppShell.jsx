import { Bell, Calendar, ChartLine, CirclePlus, Heart, LayoutDashboard, LogOut, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const PATIENT_NAV = [
  { to: "/patient", label: "Dashboard", Icon: LayoutDashboard, end: true },
  { to: "/patient/record", label: "Record vitals", Icon: CirclePlus },
  { to: "/patient/trends", label: "Trends & history", Icon: ChartLine },
  { to: "/patient/appointments", label: "Appointments", Icon: Calendar },
];
const PRO_NAV = [
  { to: "/professional", label: "My patients", Icon: Users, end: true },
  { label: "Alerts", Icon: Bell, soon: true },
  { label: "Schedule", Icon: Calendar, soon: true },
];

const ITEM = "flex h-12 w-full items-center gap-3 rounded-full px-4 font-medium focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white";

export default function AppShell() {
  const { user, logout } = useAuth();
  const patient = user.role === "patient";
  const initials = user.full_name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[260px] shrink-0 flex-col gap-2 bg-nav px-5 py-7">
        <div aria-hidden="true" className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary">
          <Heart size={22} className="text-white" />
        </div>
        <p className="px-4 pt-2 pb-1 text-sm text-nav-text">{patient ? "Patient portal" : "Clinician portal"}</p>
        <nav aria-label="Main" className="flex flex-col gap-2">
          {(patient ? PATIENT_NAV : PRO_NAV).map(({ to, label, Icon, end, soon }) =>
            soon ? (
              <span key={label} aria-disabled="true" className={`${ITEM} cursor-default text-nav-text opacity-60`}>
                <Icon size={20} aria-hidden="true" />
                {label}
                <span className="sr-only"> (coming soon)</span>
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `${ITEM} ${isActive ? "bg-primary text-white" : "text-nav-text hover:bg-white/10"}`}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </NavLink>
            )
          )}
        </nav>
        <div className="flex-1" />
        <button type="button" onClick={logout} className={`${ITEM} text-nav-text hover:bg-white/10`}>
          <LogOut size={20} aria-hidden="true" />
          Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between px-8 py-5">
          <p className="text-sm text-muted">{today}</p>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {initials}
            </span>
            <div>
              <p className="text-sm font-semibold">{user.full_name}</p>
              <p className="text-sm text-muted">{patient ? "Patient" : "Health professional"}</p>
            </div>
          </div>
        </header>
        <main className="flex flex-col gap-6 px-8 pb-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
