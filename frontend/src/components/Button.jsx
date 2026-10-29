export default function Button({ variant = "primary", loading = false, className = "", children, ...props }) {
  const base =
    "inline-flex h-12 items-center justify-center rounded-full px-6 font-medium transition " +
    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-primary text-white hover:bg-primary-dark"
      : "border-2 border-primary bg-card text-primary-dark hover:bg-primary-tint";
  return (
    <button type="button" {...props} disabled={loading || props.disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}
