import { useCallback, useState } from "react";
import type { ShipRiskTransitionEntry } from "../components/accessibility-ledger";
import { withRiskTransitionFact } from "../systems/detail-model";
import type { ScreenPoint } from "../systems/projection";
import type { DetailModel, PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

export interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

export function useWorldSelection(input: {
  world: PharosVilleWorldModel;
}) {
  const { world } = input;
  const [hoveredDetailId, setHoveredDetailId] = useState<string | null>(null);
  const [keyboardFocusedDetailId, setKeyboardFocusedDetailId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>("lighthouse");
  const [selectedDetailAnchor, setSelectedDetailAnchor] = useState<DetailAnchor | null>(null);
  const [announcement, setAnnouncement] = useState("PharosVille ready.");

  const selectedEntity = selectedDetailId ? world.entityById[selectedDetailId] ?? null : null;

  const selectDetail = useCallback((detailId: string, anchor: DetailAnchor | null = null) => {
    const detail = world.detailIndex[detailId];
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(detailId);
    setSelectedDetailAnchor(anchor);
    setAnnouncement(detail ? `Selected ${detail.title}.` : "Selected map entity.");
  }, [world.detailIndex]);

  const clearSelection = useCallback(() => {
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(null);
    setSelectedDetailAnchor(null);
    setAnnouncement("Selection cleared.");
  }, []);

  return {
    announcement,
    clearSelection,
    hoveredDetailId,
    keyboardFocusedDetailId,
    selectDetail,
    selectedDetailAnchor,
    selectedDetailId,
    selectedEntity,
    setAnnouncement,
    setHoveredDetailId,
    setKeyboardFocusedDetailId,
  };
}

export function resolveSelectedDetail(input: {
  riskTransitionByShipId: ReadonlyMap<string, ShipRiskTransitionEntry>;
  selectedDetailId: string | null;
  world: PharosVilleWorldModel;
}): DetailModel | null {
  const { riskTransitionByShipId, selectedDetailId, world } = input;
  if (!selectedDetailId) return null;
  const baseDetail = world.detailIndex[selectedDetailId] ?? null;
  if (!baseDetail) return null;
  if (!selectedDetailId.startsWith("ship.")) return baseDetail;
  const shipId = selectedDetailId.slice("ship.".length);
  const transition = riskTransitionByShipId.get(shipId) ?? null;
  return withRiskTransitionFact(baseDetail, transition);
}
