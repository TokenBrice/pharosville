"use client";

import { useState } from "react";
import type { NotableMover } from "../systems/notable-movers";

export function NotableMovers({
  movers,
  onSelect,
}: {
  movers: readonly NotableMover[];
  onSelect: (detailId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasMovers = movers.length > 0;
  const label = hasMovers ? `${movers.length} notable movers` : "Quiet seas";

  return (
    <section className="pharosville-notable-movers" aria-labelledby="pharosville-notable-movers-title">
      <button
        type="button"
        className="pharosville-notable-movers__toggle"
        aria-expanded={!collapsed}
        aria-controls="pharosville-notable-movers-list"
        onClick={() => setCollapsed((value) => !value)}
      >
        <span id="pharosville-notable-movers-title">On the seas today</span>
        <span>{collapsed ? label : "Hide"}</span>
      </button>
      {!collapsed && (
        <div id="pharosville-notable-movers-list" className="pharosville-notable-movers__body">
          {hasMovers ? (
            <ol>
              {movers.map((mover) => (
                <li key={mover.detailId}>
                  <button type="button" onClick={() => onSelect(mover.detailId)}>
                    <strong>{mover.symbol}</strong>
                    <span>{mover.change24hPctLabel}</span>
                    <span>{mover.change24hUsdLabel}</span>
                    <em>{mover.riskWaterLabel}</em>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>Quiet seas</p>
          )}
        </div>
      )}
    </section>
  );
}
