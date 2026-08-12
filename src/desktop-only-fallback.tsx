import { FALLBACK_LINKS } from "./fallback-links";

export function DesktopOnlyFallback() {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-narrow-title">
      <div className="pharosville-narrow__inner">
        <div className="pharosville-narrow__beacon" aria-hidden="true" />
        <p className="pharosville-narrow__kicker">Desktop map</p>
        <h2 id="pharosville-narrow-title">PharosVille needs a wider harbor.</h2>
        <p>
          PharosVille is a live chart of the stablecoin seas: every ship is a
          stablecoin, the water it sails in is that coin&apos;s peg risk, and the
          lighthouse beam carries the fleet-wide Peg Stability Index. Charting
          that needs room, so open this page at 900×720 or, for a wider laptop
          window, 1200×640 — or read the same signals as tables below.
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
