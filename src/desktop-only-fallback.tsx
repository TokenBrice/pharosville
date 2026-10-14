import { HARBOUR_GUIDE } from "./components/arrival-shell";
import { FALLBACK_LINKS } from "./fallback-links";

/** A static illustration of the harbour (the first-paint poster). Never live readings. */
export function HarbourIllustration() {
  return (
    <figure className="pharosville-gate__illustration">
      <picture>
        <source type="image/avif" srcSet="/harbour/poster-960.avif 960w, /harbour/poster-1600.avif 1600w" sizes="(min-width: 700px) 50vw, 100vw" />
        <source type="image/webp" srcSet="/harbour/poster-960.webp 960w, /harbour/poster-1600.webp 1600w" sizes="(min-width: 700px) 50vw, 100vw" />
        <img
          className="pharosville-gate__still"
          src="/harbour/poster-960.webp"
          width={960}
          height={600}
          alt="The PharosVille harbour at golden hour: a lighthouse headland, a town on the quay and a bay of stablecoin boats. Illustration, not live readings."
        />
      </picture>
      <figcaption>Illustration, not live readings</figcaption>
    </figure>
  );
}

export function SmallScreenWelcome({ windowCanFit }: { windowCanFit: boolean }) {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-narrow-title">
      <div className="pharosville-narrow__inner">
        <h2 id="pharosville-narrow-title">PharosVille</h2>
        <p className="pharosville-narrow__promise">A living stablecoin harbour</p>
        <HarbourIllustration />
        <p>Welcome to the harbour. Read its language here, then inspect the latest evidence on Pharos.</p>
        <dl className="pharosville-narrow__guide">
          {HARBOUR_GUIDE.map((row) => <div key={row.term}><dt>{row.term}</dt><dd>{row.text}</dd></div>)}
        </dl>
        <nav className="pharosville-narrow__links" aria-label="Pharos analytics">
          {FALLBACK_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <p className="pharosville-narrow__size">
          {windowCanFit ? "Your device can show the living harbour. Give this window more room: " : "For the living harbour, open a larger screen: "}
          900×720 or 1200×640, with either dimension first. These links open Pharos analytics; no live readings are embedded here.
        </p>
      </div>
    </section>
  );
}

export function DesktopOnlyFallback() {
  return <SmallScreenWelcome windowCanFit={false} />;
}
