import { Flag } from "lucide-react";
import Banner from "./Banner";
import Button from "./Button";
import { flagText } from "../lib/vitals";

// Reused by the patient dashboard and the assigned professional's patient view.
export default function FlaggedReadings({ headingId, rows, error, onRetry }) {
  const loading = rows === null && !error;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-6 shadow-card">
      <h2 id={headingId} className="flex items-center gap-2.5 text-xl font-semibold">
        <Flag size={22} aria-hidden="true" className="text-primary" />
        Flagged readings
      </h2>

      {loading && <p role="status" className="text-muted">Loading flagged readings…</p>}

      {error && (
        <Banner title="We couldn’t load flagged readings">
          {error}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={onRetry}>Try again</Button>
        </Banner>
      )}

      {rows?.length === 0 && <p className="text-muted">No flagged readings in evaluated history.</p>}

      {rows?.length > 0 && (
        <ul aria-label="Recent flagged readings" className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              <Flag size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn-text" />
              <div>
                <p className="font-medium text-warn-text">{flagText(row.vital_type, row.value, row.flag)}</p>
                <time dateTime={row.recorded_at} className="text-sm text-muted">
                  {new Date(row.recorded_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">Flags are a monitoring aid, not a diagnosis.</p>
    </section>
  );
}
