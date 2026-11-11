import { ChartLine, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth/AuthContext";
import Banner from "../components/Banner";
import Button from "../components/Button";
import FlaggedReadings from "../components/FlaggedReadings";
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
  const [flagRows, setFlagRows] = useState(null);
  const [flagError, setFlagError] = useState("");

  const load = useCallback(() => {
    api("/readings/latest").then(setRows).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const loadFlags = useCallback(() => {
    api("/readings/flags").then(setFlagRows).catch((e) => setFlagError(e.message));
  }, []);

  useEffect(loadFlags, [loadFlags]);

  const retryReadings = () => {
    setError("");
    setRows(null);
    load();
  };

  const retryFlags = () => {
    setFlagError("");
    setFlagRows(null);
    loadFlags();
  };

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
          <Button variant="secondary" className="mt-2 h-10" onClick={retryReadings}>Try again</Button>
        </Banner>
      )}

      <div aria-busy={loading} className="grid grid-cols-4 gap-5">
        {cards.map((c) => (
          <VitalCard key={c.label} {...c} loading={loading} />
        ))}
      </div>

      <FlaggedReadings headingId="patient-flags-heading" rows={flagRows} error={flagError} onRetry={retryFlags} />

      <div className="grid grid-cols-[1fr_380px] gap-5">
        <section className="flex flex-col items-start gap-4 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <h2 className="flex items-center gap-2.5 text-xl font-semibold">
            <ChartLine size={24} aria-hidden="true" className="text-primary" />
            Trends
          </h2>
          <p className="text-muted">
            See how your heart rate, blood pressure, temperature and oxygen saturation change over the last week,
            month, or any period you choose.
          </p>
          <Link
            to="/patient/trends"
            className="inline-flex h-12 items-center rounded-full border-2 border-primary bg-card px-6 font-medium text-primary-dark hover:bg-primary-tint focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            View trends
          </Link>
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
