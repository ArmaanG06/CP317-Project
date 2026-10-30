import { Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import Banner from "../components/Banner";
import Button from "../components/Button";
import VitalCard from "../components/VitalCard";
import usePageTitle from "../lib/usePageTitle";
import { buildCards } from "../lib/vitals";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function PatientDashboard() {
  usePageTitle("Dashboard");
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [saved] = useState(Boolean(location.state?.saved)); // set by the Record vitals page
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    setRows(null);
    api("/readings/latest").then(setRows).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  // Clear the "saved" flag from history so a refresh doesn't show the banner again.
  useEffect(() => {
    if (saved) navigate(location.pathname, { replace: true, state: null });
  }, [saved, navigate, location.pathname]);

  const cards = buildCards(rows);
  const loading = rows === null && !error;

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9 font-bold">{greeting()}, {user.full_name.split(" ")[0]}</h1>
          <p className="text-muted">Here are your latest saved readings.</p>
        </div>
        <Link
          to="/patient/record"
          className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-white hover:bg-primary-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Record reading
        </Link>
      </div>

      {saved && <Banner tone="ok" title="Reading saved">Your dashboard now shows your latest values.</Banner>}

      {error && (
        <Banner title="We couldn’t load your readings">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={load}>Try again</Button>
        </Banner>
      )}

      <div aria-busy={loading} className="grid grid-cols-4 gap-5">
        {cards.map((c) => (
          <VitalCard key={c.label} {...c} loading={loading} />
        ))}
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-5">
        <section className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Trends · last 7 days</h2>
            <span className="rounded-full bg-warn-bg px-3 py-1 text-sm text-warn-text">Coming soon</span>
          </div>
          <div aria-hidden="true" className="flex h-[120px] items-end gap-3.5">
            {[50, 75, 60, 95, 70, 88, 65, 100, 80, 72].map((h, i) => (
              <span key={i} className="w-9 rounded-lg bg-line" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="text-sm text-muted">Your trend chart and a written summary of it will appear here.</p>
        </section>
        <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <h2 className="flex items-center gap-2.5 text-base font-semibold">
            <Info size={24} aria-hidden="true" className="text-primary" />
            About your readings
          </h2>
          <p className="text-muted">
            Readings are a monitoring aid, not a diagnosis. They do not replace advice from your doctor or
            emergency services.
          </p>
          <p className="text-sm font-semibold text-alert-text">In an emergency, call 911.</p>
        </section>
      </div>
    </>
  );
}
