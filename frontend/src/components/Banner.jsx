import { Check, CircleAlert } from "lucide-react";

const TONES = {
  alert: "border-alert-text bg-alert-bg text-alert-text",
  ok: "border-ok-text bg-ok-bg text-ok-text",
};

// Always an icon plus text, never color alone.
export default function Banner({ tone = "alert", title, children }) {
  const Icon = tone === "ok" ? Check : CircleAlert;
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={`flex items-start gap-3 rounded-2xl border p-4 ${TONES[tone]}`}>
      <Icon size={22} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5">{children}</p>}
      </div>
    </div>
  );
}
