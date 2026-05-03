import { FALLBACK_LINKS } from "./fallback-links";

export function DesktopOnlyFallback() {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-narrow-title">
      <div className="pharosville-narrow__inner">
        <div className="pharosville-narrow__beacon" aria-hidden="true" />
        <p className="pharosville-narrow__kicker">Desktop map</p>
        <h2 id="pharosville-narrow-title">PharosVille needs a wider harbor.</h2>
        <p>
          PharosVille is a desktop-only map for now. Open this page on a screen at least 720px wide and 360px tall.
        </p>
        <nav className="pharosville-narrow__links" aria-label="Pharos analytics">
          {FALLBACK_LINKS.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </section>
  );
}
