import usePageTitle from "../lib/usePageTitle";

export default function ComingSoon({ title, subtitle, Icon, message }) {
  usePageTitle(title);
  return (
    <>
      <div>
        <h1 className="text-[28px] leading-9 font-bold">{title}</h1>
        <p className="text-muted">{subtitle}</p>
      </div>
      <section className="flex flex-col items-center gap-4 rounded-[20px] border border-line bg-card p-12 text-center shadow-card">
        <span className="flex size-[72px] items-center justify-center rounded-full bg-primary-tint text-primary">
          <Icon size={32} aria-hidden="true" />
        </span>
        <h2 className="text-xl font-semibold">{title}</h2>
        <span className="rounded-full bg-warn-bg px-3 py-1 text-sm text-warn-text">Coming soon</span>
        <p className="max-w-md text-muted">{message}</p>
      </section>
    </>
  );
}
