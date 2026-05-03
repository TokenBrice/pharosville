import { FALLBACK_LINKS } from "./fallback-links";

export function RotateToLandscape() {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-rotate-title">
      <div className="pharosville-narrow__inner">
        <div className="pharosville-narrow__beacon" aria-hidden="true" />
        <p className="pharosville-narrow__kicker">Desktop map</p>
        <h2 id="pharosville-rotate-title">Turn the harbor sideways.</h2>
        <p>
          PharosVille is a desktop-only map. Your device is wide enough — rotate it to
          landscape (or widen this window) to chart the market winds.
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
