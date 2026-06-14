"use client";

import { DEWS_AREA_LABEL_COLORS, LEDGER_INK_HEX } from "../systems/palette";

const BAND_KEY_ITEMS = [
  { label: "Calm", color: DEWS_AREA_LABEL_COLORS.CALM },
  { label: "Watch", color: DEWS_AREA_LABEL_COLORS.WATCH },
  { label: "Alert", color: DEWS_AREA_LABEL_COLORS.ALERT },
  { label: "Warning", color: DEWS_AREA_LABEL_COLORS.WARNING },
  { label: "Danger", color: DEWS_AREA_LABEL_COLORS.DANGER },
  { label: "Ledger", color: LEDGER_INK_HEX },
] as const;

export function BandKey() {
  return (
    <dl className="pharosville-band-key" aria-label="DEWS band color key">
      {BAND_KEY_ITEMS.map((item) => (
        <div key={item.label} className="pharosville-band-key__item">
          <dt>
            <span className="pharosville-band-key__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
            {item.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
