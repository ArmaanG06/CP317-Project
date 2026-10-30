import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import Banner from "../components/Banner";
import Button from "../components/Button";
import Field from "../components/Field";
import usePageTitle from "../lib/usePageTitle";
import { FORM_ORDER, LIMITS, rangeText, toPayload, validateForm } from "../lib/vitals";

const NO_ERRORS = { fields: {}, form: null };

export default function RecordVitals() {
  usePageTitle("Record vitals");
  const navigate = useNavigate();
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState(NO_ERRORS);
  const [busy, setBusy] = useState(false);

  const count = Object.keys(errors.fields).length;
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  function fail(next) {
    setErrors(next);
    const first = FORM_ORDER.find((k) => next.fields[k]);
    if (first) document.getElementById(`f-${first}`)?.focus(); // send keyboard users to the first problem
  }

  async function onSubmit(e) {
    e.preventDefault();
    const local = validateForm(values); // quick feedback; the server re-checks everything
    if (local.form || Object.keys(local.fields).length) return fail(local);

    setBusy(true);
    setErrors(NO_ERRORS);
    try {
      await api("/readings", { method: "POST", body: toPayload(values) });
      navigate("/patient", { state: { saved: true } });
    } catch (err) {
      const next = { fields: {}, form: null };
      if (err instanceof ApiError && err.status === 422) {
        for (const { field, message } of err.fieldErrors) {
          if (field && field in LIMITS) next.fields[field] = message;
          else next.form = message;
        }
      } else {
        next.form = err.message;
      }
      if (!next.form && !Object.keys(next.fields).length) next.form = "We couldn’t save your reading. Please try again.";
      fail(next);
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">Record a reading</h1>
        <p className="text-muted">Enter the measurements you have. Each value is checked before it is saved.</p>
      </div>

      {(count > 0 || errors.form) && (
        <Banner
          title={count > 0 ? `${count} ${count === 1 ? "reading needs" : "readings need"} attention` : "Your reading wasn’t saved"}
        >
          {count > 0 ? "Nothing was saved. Fix the fields marked below, then save again." : errors.form}
        </Banner>
      )}

      <div className="grid grid-cols-[1fr_380px] items-start gap-5">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {FORM_ORDER.map((k) => (
              <Field
                key={k}
                id={`f-${k}`}
                label={LIMITS[k].label}
                unit={LIMITS[k].unit}
                inputMode="decimal"
                autoComplete="off"
                hint={`Allowed: ${rangeText(k)}`}
                error={errors.fields[k]}
                value={values[k] ?? ""}
                onChange={set(k)}
              />
            ))}
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={busy}>{busy ? "Saving…" : "Save reading"}</Button>
            <Button variant="secondary" onClick={() => navigate("/patient")}>Cancel</Button>
          </div>
        </form>

        <section className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-card p-6 shadow-card">
          <h2 className="text-base font-semibold">Allowed ranges</h2>
          {FORM_ORDER.map((k) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted">{LIMITS[k].label.replace(" pressure", "")}</span>
              <span className="text-sm font-semibold">{rangeText(k)}</span>
            </div>
          ))}
          <p className="text-sm text-muted">
            Enter both blood pressure numbers together, and systolic must be higher than diastolic. Each reading is
            saved with the date and time and marked as patient-entered.
          </p>
        </section>
      </div>
    </>
  );
}
