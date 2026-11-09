import { HARBOUR_GUIDE } from "./components/arrival-shell";
import { FALLBACK_LINKS } from "./fallback-links";
import { MIN_LONG_SIDE_PX, MIN_SHORT_SIDE_PX } from "./systems/viewport-gate";

/** D20's reason lines, one per branch of the gate (index.html carries both; main.tsx shows one). */
export const SCREEN_REASON = "The live harbour needs a larger screen. Explore the same readings on Pharos.";
export const WINDOW_REASON = `Give this window at least ${MIN_LONG_SIDE_PX}×${MIN_SHORT_SIDE_PX} CSS pixels, either way round. The harbour opens automatically.`;

/**
 * The welcome's static details (D20, S26-I8): the harbour's own approved teaching, word for word (the legend in
 * ui/Ledger.tsx and ui/facts.ts; client.test.tsx checks the source), each paired with its analytics page.
 */
export const WELCOME_DETAILS = [
  {
    summary: "Sea and weather",
    text: ["Sea state is the share of supply off peg. Weather is early-warning stress. Early warning, not a depeg."],
    link: FALLBACK_LINKS[3]!,
  },
  {
    summary: "Unavailable readings",
    text: [
      "Fog means stale data. When the feed stops refreshing, fog rolls in and every boat finishes its leg and holds. Nothing pretends to be live.",
      "A slow, wide sweep is a calm market; a faster, shorter beam is stress. A dark lantern means no reading.",
    ],
    link: FALLBACK_LINKS[0]!,
  },
] as const;

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

/** The same welcome as index.html's first-byte page (client.test.tsx keeps the copies identical): reason first. */
export function SmallScreenWelcome({ windowCanFit }: { windowCanFit: boolean }) {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-narrow-title">
      <div className="pharosville-narrow__inner">
        <h2 id="pharosville-narrow-title" className="pharosville-narrow__mark">Pharos<i>Ville</i></h2>
        <p className="pharosville-narrow__promise">A living stablecoin harbour</p>
        <div className="pharosville-narrow__gate">
          <p className="pharosville-narrow__reason">{windowCanFit ? WINDOW_REASON : SCREEN_REASON}</p>
          <p className="pharosville-narrow__actions"><a className="pharosville-narrow__primary" href="https://pharos.watch/">Open Pharos analytics</a></p>
        </div>
        <HarbourIllustration />
        <p>Welcome to the harbour. Read its language here, then inspect the latest evidence on Pharos.</p>
        <dl className="pharosville-narrow__guide">
          {HARBOUR_GUIDE.map((row) => <div key={row.term}><dt>{row.term}</dt><dd>{row.text}</dd></div>)}
        </dl>
        {WELCOME_DETAILS.map((detail) => (
          <details key={detail.summary} className="pharosville-narrow__more">
            <summary>{detail.summary}</summary>
            {detail.text.map((text) => <p key={text}>{text}</p>)}
            <p><a href={detail.link.href}>{detail.link.label}</a></p>
          </details>
        ))}
        <nav className="pharosville-narrow__links" aria-label="Pharos analytics">
          {FALLBACK_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <p className="pharosville-narrow__size">
          {!windowCanFit && `For the living harbour, open a larger screen, such as a tablet, an unfolded foldable or a computer: at least ${MIN_LONG_SIDE_PX}×${MIN_SHORT_SIDE_PX}, with either dimension first. `}
          These links open Pharos analytics; no live readings are embedded here.
        </p>
      </div>
    </section>
  );
}

export function DesktopOnlyFallback() {
  return <SmallScreenWelcome windowCanFit={false} />;
}
