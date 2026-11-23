import { Check, SlidersHorizontal, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { LIMITS } from "../lib/vitals";
import Banner from "./Banner";
import Button from "./Button";
import Field from "./Field";

const ORDER = ["heart_rate", "systolic", "diastolic", "temperature", "spo2"];
const NUMBER = /^-?\d+(\.\d+)?$/;

// THR-1: an assigned professional sets the flag limits for one patient. The server enforces assignment
// and validates again; the checks here only give faster feedback.
function validate(lower, upper, label) {
  const errors = {};
  if (!NUMBER.test(lower.trim())) errors.lower = `${label} low limit must be a number.`;
  if (!NUMBER.test(upper.trim())) errors.upper = `${label} high limit must be a number.`;
  if (!errors.lower && !errors.upper && Number(lower) >= Number(upper))
    errors.lower = `${label} low limit must be lower than the high limit.`;
  return errors;
}

const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function LimitRow({ patientId, item, notice, onSaved }) {
  const { label, unit } = LIMITS[item.vital_type];
  const [lower, setLower] = useState(String(item.lower));
  const [upper, setUpper] = useState(String(item.upper));
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const path = `/patients/${patientId}/thresholds/${item.vital_type}`;
  const custom = item.source === "patient_override";

  async function run(request, done) {
    setBusy(true);
    setBanner("");
    try {
      await request();
      onSaved(done); // the parent reloads; a changed limit remounts this row with the new values
    } catch (e) {
      setBanner(e.message);
    } finally {
      setBusy(false); // also covers saving unchanged values, when the row is not remounted
    }
  }

  function save(e) {
    e.preventDefault();
    const found = validate(lower, upper, label);
    setErrors(found);
    if (found.lower || found.upper) return;
    run(() => api(path, { method: "PUT", body: { lower: Number(lower), upper: Number(upper) } }), "Saved");
  }

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <form onSubmit={save} noValidate aria-label={`${label} limits`} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-base font-semibold">{label}</h3>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-3 py-1 text-sm font-medium text-primary-dark">
            <Tag size={14} aria-hidden="true" />
            {custom ? "Custom limits" : "Default limits"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id={`${item.vital_type}-lower`} label="Low limit" unit={unit} inputMode="decimal"
            value={lower} error={errors.lower} onChange={(e) => setLower(e.target.value)} />
          <Field id={`${item.vital_type}-upper`} label="High limit" unit={unit} inputMode="decimal"
            value={upper} error={errors.upper} onChange={(e) => setUpper(e.target.value)} />
        </div>
        {banner && <Banner title="We couldn’t save these limits">{banner}</Banner>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} className="h-10">Save {label.toLowerCase()} limits</Button>
          {custom && (
            <Button variant="secondary" loading={busy} className="h-10"
              onClick={() => run(() => api(path, { method: "DELETE" }), "Reset to default")}>
              Reset to default
            </Button>
          )}
          {notice && (
            <p role="status" className="inline-flex items-center gap-1.5 text-sm font-medium text-ok-text">
              <Check size={18} aria-hidden="true" />
              {notice}
            </p>
          )}
        </div>
        {custom && item.updated_at && (
          <p className="text-sm text-muted">
            Last changed {when(item.updated_at)}
            {item.updated_by_name ? ` by ${item.updated_by_name}` : ""}.
          </p>
        )}
      </form>
    </li>
  );
}

export default function ThresholdsPanel({ patientId }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null); // { vital, text } shown on the row that was just saved

  const load = useCallback(() => {
    return api(`/patients/${patientId}/thresholds`)
      .then((rows) => {
        setError("");
        setItems(rows);
      })
      .catch((e) => setError(e.message));
  }, [patientId]);
  useEffect(() => {
    load();
  }, [load]);

  const sorted = items && ORDER.map((k) => items.find((i) => i.vital_type === k)).filter(Boolean);

  return (
    <section aria-labelledby="thresholds-heading" className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
      <h2 id="thresholds-heading" className="flex items-center gap-2.5 text-xl font-semibold">
        <SlidersHorizontal size={22} aria-hidden="true" className="text-primary" />
        Flag thresholds
      </h2>
      <p className="text-muted">
        A reading outside these limits is flagged. Changes apply to readings entered after you save; existing
        flags stay as they were.
      </p>

      {!items && !error && <p role="status" className="text-muted">Loading thresholds…</p>}
      {error && (
        <Banner title="We couldn’t load thresholds">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={() => { setError(""); load(); }}>Try again</Button>
        </Banner>
      )}
      {sorted && (
        <ul className="divide-y divide-line">
          {sorted.map((item) => (
            <LimitRow
              key={`${item.vital_type}:${item.lower}:${item.upper}:${item.source}:${item.updated_at}`}
              patientId={patientId}
              item={item}
              notice={notice?.vital === item.vital_type ? notice.text : ""}
              onSaved={(text) => {
                setNotice({ vital: item.vital_type, text });
                load();
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
