import { ChartLine } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import Banner from "./Banner";
import Button from "./Button";
import Field from "./Field";
import {
  checkRange,
  DEFAULT_DAYS,
  formatDay,
  formatMoment,
  formatRange,
  periodParams,
  PRESETS,
  presetRange,
  summaryText,
  buildSeries,
  CHARTS,
  filterReadings,
} from "../lib/trends";

const COLORS = ["#1F6F5C", "#2F4FD0"]; // --color-primary, --color-accent

// TR_REP-1 / MON-2: vital-sign trends over a chosen period. `historyPath` is /readings/history for the
// signed-in patient, or /patients/{id}/readings/history for a professional viewing an assigned patient.
// TR_REP-2/3 filter the returned values locally by vital and saved threshold flag.
export default function TrendsPanel({ historyPath }) {
  const [range, setRange] = useState(() => presetRange(DEFAULT_DAYS));
  const [draft, setDraft] = useState(range); // the From/To inputs before they're applied
  const [data, setData] = useState(null);
  const [error, setError] = useState(null); // { title, messages }
  const [vital, setVital] = useState("");
  const [flagStatus, setFlagStatus] = useState("");
  const latestRequest = useRef(0);

  const fetchHistory = useCallback(
    (r) => {
      const request = ++latestRequest.current;
      const query = new URLSearchParams(periodParams(r.from, r.to));
      return api(`${historyPath}?${query}`)
        .then((d) => request === latestRequest.current && setData(d))
        .catch((e) => {
          if (request !== latestRequest.current) return; // a newer period or patient is already loading
          const messages = e.fieldErrors?.length ? e.fieldErrors.map((f) => f.message) : [e.message];
          setError({ title: "We couldn’t load these trends", messages });
        });
    },
    [historyPath]
  );

  useEffect(() => {
    fetchHistory(range);
  }, [fetchHistory, range]);

  function show(next) {
    setData(null);
    setError(null);
    setDraft(next);
    setRange(next);
  }

  function applyCustom(e) {
    e.preventDefault();
    const problem = checkRange(draft.from, draft.to);
    if (problem) return setError({ title: "Check the dates", messages: [problem] });
    show({ from: draft.from, to: draft.to, days: null });
  }

  const retry = () => show({ ...range });
  const filteredReadings = data ? filterReadings(data.readings, vital, flagStatus) : [];
  const charts = data ? buildSeries(filteredReadings).filter((chart) => !vital || chart.key === vital) : [];
  const loading = data === null && !error;

  return (
    <section aria-labelledby="trends-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="trends-heading" className="flex items-center gap-2.5 text-xl font-semibold">
            <ChartLine size={24} aria-hidden="true" className="text-primary" />
            Trends
          </h2>
          <p className="text-sm text-muted" aria-live="polite">
            Showing {formatRange(range.from, range.to)}
            {data && ` · ${filteredReadings.length} ${filteredReadings.length === 1 ? "value" : "values"}`}
          </p>
        </div>

        <div role="group" aria-label="Time period" className="flex flex-wrap gap-2">
          {PRESETS.map((days) => (
            <Button
              key={days}
              variant={range.days === days ? "primary" : "secondary"}
              aria-pressed={range.days === days}
              className="h-10"
              onClick={() => show(presetRange(days))}
            >
              Last {days} days
            </Button>
          ))}
        </div>

        <form onSubmit={applyCustom} noValidate className="flex flex-wrap items-end gap-4">
          <div className="w-48">
            <Field id="trend-from" label="From" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
          </div>
          <div className="w-48">
            <Field id="trend-to" label="To" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
          </div>
          <Button type="submit" variant="secondary">Show period</Button>
        </form>
        <p className="text-sm text-muted">Both dates are included.</p>

        <div className="flex flex-wrap gap-4">
          <div className="w-56">
            <Field id="trend-vital" label="Vital sign" value={vital} onChange={(e) => setVital(e.target.value)}
              emptyLabel="All vital signs" options={CHARTS.map(({ key, label }) => ({ value: key, label }))} />
          </div>
          <div className="w-56">
            <Field id="trend-flags" label="Flag status" value={flagStatus} onChange={(e) => setFlagStatus(e.target.value)}
              emptyLabel="All readings" options={[{ value: "flagged", label: "Flagged" }, { value: "unflagged", label: "Unflagged" }]} />
          </div>
        </div>
        <p className="text-sm text-muted">Flags show readings outside saved monitoring limits, not a clinical risk level.</p>
      </div>

      {error && (
        <Banner title={error.title}>
          {error.messages.join(" ")}{" "}
          <Button variant="secondary" className="mt-2 h-10" onClick={retry}>Try again</Button>
        </Banner>
      )}

      {loading && (
        <p role="status" className="text-muted">Loading trends…</p>
      )}

      {data && data.readings.length === 0 && (
        <div className="rounded-[20px] border border-line bg-card p-8 text-center shadow-card">
          <p className="font-semibold">No readings in this period</p>
          <p className="text-muted">Choose a longer period, or record a reading to start a trend.</p>
        </div>
      )}

      {data && data.readings.length > 0 && filteredReadings.length === 0 && (
        <div className="rounded-[20px] border border-line bg-card p-8 text-center shadow-card">
          <p className="font-semibold">No readings match these filters</p>
          <p className="text-muted">Try another vital sign, flag status, or time period.</p>
        </div>
      )}

      {data && filteredReadings.length > 0 && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {charts.map((chart) => (
            <TrendChart key={chart.key} chart={chart} />
          ))}
        </div>
      )}
    </section>
  );
}

function TrendChart({ chart }) {
  const empty = chart.points.length === 0;
  return (
    <section aria-label={`${chart.label} trend`} className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-5 shadow-card">
      <h3 className="text-base font-semibold">
        {chart.label} <span className="font-normal text-muted">({chart.unit})</span>
      </h3>
      {empty ? (
        <p className="text-muted">No {chart.label.toLowerCase()} readings in this period.</p>
      ) : (
        <>
          <div aria-hidden="true" className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart.points} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="#DCE8E3" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={formatDay} tick={{ fontSize: 12 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} />
                <Tooltip labelFormatter={formatMoment} formatter={(v, name) => [`${v} ${chart.unit}`, name]} />
                {chart.lines.length > 1 && <Legend />}
                {chart.lines.map((line, i) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    name={line.name}
                    stroke={COLORS[i]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-sm text-muted">{summaryText(chart)}</p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-primary-dark">Show values as a table</summary>
            <table className="mt-2 w-full text-left">
              <caption className="sr-only">{chart.label} readings</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 font-semibold">Date and time</th>
                  {chart.lines.map((l) => (
                    <th key={l.key} scope="col" className="py-1 font-semibold">{l.name} ({chart.unit})</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chart.points.map((p, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{formatMoment(p.t)}</td>
                    {chart.lines.map((l) => (
                      <td key={l.key} className="py-1 tabular-nums">{p[l.key] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
