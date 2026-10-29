// Stand-in for pages built under other stories. Replace each route's element with the real page.
export default function PlaceholderPage({ title, story }) {
  return (
    <section>
      <h1>{title}</h1>
      {story && <p className="muted">Built under {story}.</p>}
    </section>
  );
}
