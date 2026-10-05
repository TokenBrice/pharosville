import type { ReactNode } from "react";
import { FALLBACK_LINKS } from "./fallback-links";

export function SmallScreenWelcome({ windowCanFit, illustration }: { windowCanFit: boolean; illustration?: ReactNode }) {
  return (
    <section className="pharosville-narrow" aria-labelledby="pharosville-narrow-title">
      <div className="pharosville-narrow__inner">
        <h1 id="pharosville-narrow-title">PharosVille</h1>
        <p className="pharosville-narrow__promise">A living stablecoin garden</p>
        {illustration}
        <p>Welcome to the garden. Read its language here, then inspect the latest evidence on Pharos.</p>
        <dl className="pharosville-narrow__guide">
          <div><dt>Lighthouse</dt><dd>The official Pharos Stability Index describes the market as a whole.</dd></div>
          <div><dt>Water</dt><dd>Surface signatures distinguish categorical peg risk; missing evidence is not calm.</dd></div>
          <div><dt>Sails</dt><dd>One ship is one stablecoin. Size uses a compressed supply scale, not proportional market cap.</dd></div>
        </dl>
        <nav className="pharosville-narrow__links" aria-label="Pharos analytics">
          {FALLBACK_LINKS.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <p className="pharosville-narrow__size">
          {windowCanFit ? "Your device can show the interactive garden. Give this window more room: " : "For the interactive garden, open a larger screen: "}
          900×720 or 1200×640, with either dimension first. These links open Pharos analytics; no live readings are embedded here.
        </p>
      </div>
    </section>
  );
}

export function DesktopOnlyFallback(props: { illustration?: ReactNode }) {
  return <SmallScreenWelcome {...props} windowCanFit={false} />;
}
