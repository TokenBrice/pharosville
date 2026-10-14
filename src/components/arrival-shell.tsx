/**
 * The generic guide to the harbour's language. index.html carries the same three lines for the
 * no-JS first paint; client.test.tsx keeps the copies identical. No live readings here.
 */
export const HARBOUR_GUIDE: ReadonlyArray<{ term: string; text: string }> = [
  { term: "Boats", text: "One boat is one stablecoin. It sails a circuit between its chains and docks longest where it holds the most supply." },
  { term: "Lighthouse", text: "The beam is the Pharos Stability Index: the market as a whole." },
  { term: "Sea and sky", text: "Rough water is supply trading off its peg, storms are stress signals, and fog means the data has gone stale." },
];

interface ArrivalShellProps {
  stage: string;
}

/** Overlay on the first-paint poster while the harbour loads (and the no-JS page in index.html). */
export function ArrivalShell({ stage }: ArrivalShellProps) {
  return (
    <section className="pv-arrival" aria-label="PharosVille welcome">
      <h2 className="pv-arrival__mark">Pharos<i>Ville</i></h2>
      <div className="pv-arrival__card">
        <p className="pv-arrival__promise">A living stablecoin harbour</p>
        <dl className="pv-arrival__guide">
          {HARBOUR_GUIDE.map((row) => <div key={row.term}><dt>{row.term}</dt><dd>{row.text}</dd></div>)}
        </dl>
        <p className="pv-arrival__stage" role="status">{stage}</p>
        <nav aria-label="Pharos analytics">
          <a href="https://pharos.watch/">Open Pharos analytics</a>
          <a href="https://pharos.watch/stability-index/">Stability Index</a>
        </nav>
      </div>
    </section>
  );
}

/** A rejected module or a failed renderer keeps the poster, the guide and the useful links. */
export function ArrivalModuleFailure({ reason = "The harbour module could not load." }: { reason?: string }) {
  return <ArrivalShell stage={`${reason} Open Pharos analytics, or reload this page to retry.`} />;
}
