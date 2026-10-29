import { CircleAlert } from "lucide-react";

// Labelled input with an optional unit shown inside the field, a hint, and an inline error.
// Pass `options` ([{ value, label }]) to render a dropdown instead of a text input.
export default function Field({ id, label, hint, error, unit, options, ...inputProps }) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const Control = options ? "select" : "input";
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {unit && <span className="sr-only"> ({unit})</span>}
      </label>
      <div className="relative">
        <Control
          id={id}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={describedBy}
          className={
            "h-12 w-full rounded-xl bg-card px-4 text-base text-ink focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-accent " +
            (unit ? "pr-16 " : "") +
            (error ? "border-2 border-alert-text" : "border border-field")
          }
          {...inputProps}
        >
          {options && (
            <>
              <option value="">Select…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </>
          )}
        </Control>
        {unit && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-medium text-muted">
            {unit}
          </span>
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-alert-text">
          <CircleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}
