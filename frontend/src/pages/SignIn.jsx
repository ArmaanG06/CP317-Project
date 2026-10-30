import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
import usePageTitle from "../lib/usePageTitle";

// Dev-only shortcuts for the fake demo accounts. Vite removes them from production builds.
const DEMO = {
  patient: { email: "maya.chen@example.com", password: "Demo-Pass-123" },
  professional: { email: "dr.lee@example.com", password: "Demo-Pass-123" },
};

export default function SignIn() {
  usePageTitle("Sign in");
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function attempt(creds) {
    setBusy(true);
    setError("");
    try {
      await login(creds.email, creds.password); // success sets the user, which triggers the redirect above
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    attempt({ email: email.trim(), password });
  }

  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[640px] shrink-0 items-center bg-nav px-16 text-nav-text lg:flex">
        <div className="flex flex-col gap-4">
          <p className="text-[40px] leading-[48px] font-bold text-white">Your health readings, in one place.</p>
          <p>
            Record heart rate, blood pressure, temperature and oxygen saturation, and share a clear history
            with your care team.
          </p>
        </div>
        <p className="absolute inset-x-16 bottom-16 text-sm">
          This prototype uses artificial patient data only. No real health information is stored.
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full max-w-[440px] flex-col gap-5 rounded-[20px] border border-line bg-card p-10 shadow-card">
          <div>
            <h1 className="text-[28px] leading-9 font-bold">Sign in</h1>
            <p className="text-muted">Welcome back. Enter your details to continue.</p>
          </div>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Field
              id="email" label="Email" type="email" autoComplete="email"
              hint="Use the email registered with your account."
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              id="password" label="Password" type="password" autoComplete="current-password"
              hint="Passwords are stored as salted hashes, never as plain text."
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
            {error && <Banner title={error} />}
            <Button type="submit" loading={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          {import.meta.env.DEV && (
            <>
              <div className="flex items-center gap-3 text-sm text-muted">
                <span className="h-px flex-1 bg-line" />
                Prototype demo accounts
                <span className="h-px flex-1 bg-line" />
              </div>
              <Button variant="secondary" loading={busy} onClick={() => attempt(DEMO.patient)}>
                Continue as Maya Chen (patient)
              </Button>
              <Button variant="secondary" loading={busy} onClick={() => attempt(DEMO.professional)}>
                Continue as Dr. Lee (health professional)
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
