import { Droplet, Flag, Heart, Thermometer, Wind } from "lucide-react";
import { flagText, formatWhen } from "../lib/vitals";

const ICONS = { heart: Heart, bp: Droplet, temp: Thermometer, spo2: Wind };

export default function VitalCard({ label, unit, icon, reading, loading }) {
  const Icon = ICONS[icon];
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-[20px] border border-line bg-card p-5 shadow-card">
      <div className="flex items-center gap-3 text-sm font-semibold">
        <span className="flex size-11 items-center justify-center rounded-full bg-primary-tint text-primary">
          <Icon size={24} aria-hidden="true" />
        </span>
        {label}
      </div>
      <p className="flex items-baseline gap-2 text-4xl leading-[44px] font-bold tabular-nums">
        {loading ? (
          <span aria-hidden="true" className="h-9 w-24 animate-pulse rounded-lg bg-line" />
        ) : reading ? (
          <>
            {reading.display}
            <span className="text-base font-medium text-muted">{unit}</span>
          </>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </p>
      <p className="text-sm text-muted">{loading ? "Loading…" : reading ? formatWhen(reading.at) : "No reading available"}</p>
      {!loading && (
        <span className="self-start rounded-full bg-primary-tint px-2.5 py-1 text-sm text-primary-dark">
          {reading ? "Patient-entered" : "Awaiting first reading"}
        </span>
      )}
      {!loading && reading?.flags?.length > 0 && (
        <div className="rounded-xl bg-warn-bg p-3 text-sm text-warn-text">
          <p className="flex items-center gap-2 font-semibold">
            <Flag size={16} aria-hidden="true" />
            Flagged for review
          </p>
          <ul className="mt-1 list-inside list-disc">
            {reading.flags.map(({ vitalType, value, flag }) => (
              <li key={vitalType}>{flagText(vitalType, value, flag)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
