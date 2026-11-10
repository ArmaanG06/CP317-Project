import { Info } from "lucide-react";
import TrendsPanel from "../components/TrendsPanel";
import usePageTitle from "../lib/usePageTitle";

// TR_REP-1: the signed-in patient's vital-sign trends over a period they choose.
export default function Trends() {
  usePageTitle("Trends & history");
  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">Trends & history</h1>
        <p className="text-muted">See how your readings change over a period you choose.</p>
      </div>

      <TrendsPanel historyPath="/readings/history" />

      <p className="flex items-start gap-2 text-sm text-muted">
        <Info size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        Readings are a monitoring aid, not a diagnosis. They do not replace advice from your doctor or emergency
        services.
      </p>
    </>
  );
}
