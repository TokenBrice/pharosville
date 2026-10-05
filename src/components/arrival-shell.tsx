interface ArrivalShellProps {
  stage: string;
  veil?: boolean;
}

/** Generic guide only: observations belong to the independent live reading key. */
export function ArrivalShell({ stage, veil = false }: ArrivalShellProps) {
  return (
    <section className={`pv-arrival-shell${veil ? " pv-arrival-shell--veil" : ""}`} aria-label="PharosVille welcome">
      <div className="pv-arrival-shell__content">
        <h1>PharosVille</h1>
        <p className="pv-arrival-shell__promise">A living stablecoin garden</p>
        <p>Watch the market, then inspect the evidence.</p>
        <dl className="pv-arrival-shell__guide">
          <div><dt>Lighthouse</dt><dd>The official Pharos Stability Index describes the market as a whole.</dd></div>
          <div><dt>Water</dt><dd>Surface signatures distinguish categorical peg risk; missing evidence is not calm.</dd></div>
          <div><dt>Sails</dt><dd>One ship is one stablecoin. Size uses a compressed supply scale, not proportional market cap.</dd></div>
        </dl>
        <p className="pv-arrival-shell__stage" role="status">{stage}</p>
        <nav aria-label="Pharos analytics">
          <a href="https://pharos.watch/">Open Pharos analytics</a>
          <a href="https://pharos.watch/stability-index/">Stability Index</a>
        </nav>
      </div>
    </section>
  );
}

/** A rejected presentation/data module retains useful DOM; renderer failures
 * are handled inside the world by its selectable WorldStaticOverview. */
export function ArrivalModuleFailure() {
  return <ArrivalShell stage="The world module could not load. Open Pharos analytics, or reload this page to retry." />;
}
