/**
 * The full keyboard list, at the foot of the ledger's Legend tab. The corner strip keeps only
 * / L C H; everything else is listed here.
 */
const KEYS: Array<[string, string]> = [
  ["/", "find a coin or chain"],
  ["L", "this ledger"],
  ["C", "chart names"],
  ["H", "home (again: here you are)"],
  ["← ↑ → ↓", "pan"],
  ["+ −", "zoom (the wheel zooms where you point)"],
  ["[ ]", "step through the ships in view, largest first"],
  ["F", "follow the selected ship while she sails"],
  ["W", "the harbourmaster’s watch: visit the day’s notable ships"],
  ["P", "a postcard of the harbour as it is now"],
  ["Esc", "close, or let go"],
];

export function KeyList() {
  return (
    <section className="hb-keylist" aria-label="Keyboard">
      <h3 className="hb-sc">Keyboard</h3>
      <dl>
        {KEYS.map(([k, what]) => <div key={k}><dt>{k.split(" ").map((x) => <kbd key={x}>{x}</kbd>)}</dt><dd>{what}</dd></div>)}
      </dl>
    </section>
  );
}
