import { useCallback, useEffect, useRef, useState } from "react";
import type { ShipRiskTransitionEntry } from "../components/accessibility-ledger";
import { withRiskTransitionFact } from "../systems/detail-model";
import type { ScreenPoint } from "../systems/projection";
import type { DetailModel, PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

export const DEFAULT_WORLD_SELECTED_DETAIL_ID = "lighthouse";
const LIVE_REGION_ANNOUNCEMENT_INTERVAL_MS = 150;

export interface DetailAnchor extends ScreenPoint {
  side: "left" | "right";
}

export function useWorldSelection(input: {
  initialSelectedDetailId?: string | null;
  world: PharosVilleWorldModel;
}) {
  const { initialSelectedDetailId = DEFAULT_WORLD_SELECTED_DETAIL_ID, world } = input;
  const [hoveredDetailId, setHoveredDetailId] = useState<string | null>(null);
  const [keyboardFocusedDetailId, setKeyboardFocusedDetailId] = useState<string | null>(null);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(() => initialSelectedDetailId);
  const [selectedDetailAnchor, setSelectedDetailAnchor] = useState<DetailAnchor | null>(null);
  const [announcement, setLiveRegionAnnouncement] = useState("PharosVille ready.");
  const announcementQueueRef = useRef<string[]>([]);
  const announcementTimerRef = useRef<number | null>(null);
  const flushNextAnnouncementRef = useRef<() => void>(() => {});

  const flushNextAnnouncement = useCallback(() => {
    const nextAnnouncement = announcementQueueRef.current.shift();
    if (!nextAnnouncement) {
      announcementTimerRef.current = null;
      return;
    }

    setLiveRegionAnnouncement(nextAnnouncement);
    announcementTimerRef.current = window.setTimeout(() => {
      flushNextAnnouncementRef.current();
    }, LIVE_REGION_ANNOUNCEMENT_INTERVAL_MS);
  }, []);

  useEffect(() => {
    flushNextAnnouncementRef.current = flushNextAnnouncement;
  }, [flushNextAnnouncement]);

  const setAnnouncement = useCallback((message: string) => {
    announcementQueueRef.current.push(message);
    if (announcementTimerRef.current === null) {
      flushNextAnnouncement();
    }
  }, [flushNextAnnouncement]);

  useEffect(() => () => {
    if (announcementTimerRef.current !== null) {
      window.clearTimeout(announcementTimerRef.current);
      announcementTimerRef.current = null;
    }
  }, []);

  const selectedEntity = selectedDetailId ? world.entityById[selectedDetailId] ?? null : null;

  const selectDetail = useCallback((detailId: string, anchor: DetailAnchor | null = null) => {
    const detail = world.detailIndex[detailId];
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(detailId);
    setSelectedDetailAnchor(anchor);
    setAnnouncement(detail ? `Selected ${detail.title}.` : "Selected map entity.");
  }, [setAnnouncement, world.detailIndex]);

  const clearSelection = useCallback(() => {
    setKeyboardFocusedDetailId(null);
    setHoveredDetailId(null);
    setSelectedDetailId(null);
    setSelectedDetailAnchor(null);
    setAnnouncement("Selection cleared.");
  }, [setAnnouncement]);

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
