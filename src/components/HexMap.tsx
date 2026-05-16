'use client';

import React, {
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  Character,
  CharacterMapData,
  CharacterUpdater,
  FayeDoor,
  FayeDoorDestination,
  HexCoord,
  Layline,
  LaylineDraft,
  MapPOI,
} from '@/lib/types';
import { ALL_HEXES, HEX_CELLS, HEX_GRID_META } from '@/lib/hex-grid';
import { gridBounds, hexCenter, hexVertices, parseCoord, pixelToHex } from '@/lib/hex';

interface HexMapProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

const TERRAIN_FILL: Record<string, string> = {
  woods: '#2d4a2e',
  open: '#4a3a26',
  edge: '#1a1a2e',
};

const TERRAIN_STROKE = '#5a3a28';
const DEFAULT_LAYLINE_COLORS = ['#c4a35a', '#7a5fc4', '#5fa3c4', '#c45f7a', '#7ac45f'];

// Hex-coord label opacity ramps from MIN at view.w ≥ COORD_LABEL_FADE_AT
// (zoomed out) to MAX at view.w → 0 (fully zoomed in). With the default
// view.w == baseBounds.w, the formula yields ~0.29 → above the MIN floor;
// the floor only kicks in if the user expands view.w beyond baseBounds.w.
const COORD_LABEL_OPACITY_MIN = 0.15;
const COORD_LABEL_OPACITY_MAX = 0.7;
const COORD_LABEL_FADE_AT = 1.4; // multiplier on baseBounds.w
// Cursor must travel this many screen pixels during a shift-drag for the
// gesture to be treated as a "real pan" (vs. an unintentional micro-shift
// before a click). Suppresses the synthetic click at the end of the drag.
const PAN_DRAG_THRESHOLD_PX = 3;

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}`;
}

/**
 * Doors a given `selfId` can be paired with without breaking another
 * door's existing symmetric link. Includes wild doors that aren't already
 * claimed by anyone (other than self), and roaded doors whose current
 * partner is missing or is the self.
 */
function pairableDoors(allDoors: FayeDoor[], selfId: string | null): FayeDoor[] {
  // Build reverse index: doorId -> set of other doors targeting it.
  const targetedBy = new Map<string, Set<string>>();
  for (const d of allDoors) {
    if (d.destination.kind === 'roaded') {
      const set = targetedBy.get(d.destination.pairedDoorId) ?? new Set<string>();
      set.add(d.id);
      targetedBy.set(d.destination.pairedDoorId, set);
    }
  }
  return allDoors.filter((d) => {
    if (d.id === selfId) return false;
    if (d.destination.kind === 'wild') {
      const claims = targetedBy.get(d.id);
      if (!claims || claims.size === 0) return true;
      // Asymmetric pre-existing data: another door points at this wild
      // door. Only pairable if that "other" is self (and nobody else).
      return selfId !== null && claims.size === 1 && claims.has(selfId);
    }
    // Roaded: pairable if mutually-linked to self, or if its partner is gone.
    const partnerId = d.destination.pairedDoorId;
    if (selfId !== null && partnerId === selfId) return true;
    return !allDoors.some((x) => x.id === partnerId);
  });
}

/**
 * Compute every door record that must change when `selfId`'s destination
 * is reassigned to `nextDestination`. Handles three transition shapes:
 *   wild → roaded(P): point P back at self; if P was already paired with
 *     a different Q, mark Q wild (otherwise Q is left dangling at P).
 *   roaded(P) → wild: mark P wild.
 *   roaded(P) → roaded(Q): mark P wild and the same P/Q clean-up as the
 *     wild→roaded case for Q's prior partner.
 * The self record is NOT included in the returned list — caller writes it.
 */
function computePartnerUpdates(
  selfId: string,
  selfPrev: FayeDoorDestination,
  nextDestination: FayeDoorDestination,
  allDoors: FayeDoor[],
): FayeDoor[] {
  const updates = new Map<string, FayeDoor>();
  const setWild = (doorId: string) => {
    if (doorId === selfId || updates.has(doorId)) return;
    const door = allDoors.find((d) => d.id === doorId);
    if (!door) return;
    if (door.destination.kind === 'wild') return; // already wild — no change
    updates.set(doorId, { ...door, destination: { kind: 'wild' } });
  };

  // Self's previous partner (if any) loses its link.
  if (selfPrev.kind === 'roaded') {
    const oldId = selfPrev.pairedDoorId;
    if (oldId && (nextDestination.kind !== 'roaded' || nextDestination.pairedDoorId !== oldId)) {
      setWild(oldId);
    }
  }

  if (nextDestination.kind === 'roaded') {
    const newPartnerId = nextDestination.pairedDoorId;
    const newPartner = allDoors.find((d) => d.id === newPartnerId);
    if (newPartner) {
      // If new partner was already paired with someone else, that someone
      // is now orphaned — clear them too.
      if (
        newPartner.destination.kind === 'roaded' &&
        newPartner.destination.pairedDoorId !== selfId
      ) {
        setWild(newPartner.destination.pairedDoorId);
      }
      // Point new partner back at self.
      updates.set(newPartnerId, {
        ...newPartner,
        destination: {
          kind: 'roaded',
          pairedDoorId: selfId,
          roadName: nextDestination.roadName,
        },
      });
    }
  }

  return Array.from(updates.values());
}

export default function HexMap({ character, onChange }: HexMapProps) {
  // Migration v11→v12 + reconcileWithDefaults guarantee mapData is a
  // well-shaped object, so we can read it directly.
  const mapData = character.mapData;
  const drawingLayline = mapData.draftLayline ?? null;
  // gridBounds() returns a module-level frozen constant; no useMemo needed.
  const baseBounds = gridBounds();

  const [view, setView] = useState({ x: baseBounds.x, y: baseBounds.y, w: baseBounds.w, h: baseBounds.h });
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [selectedLayline, setSelectedLayline] = useState<string | null>(null);
  // When the user clicks a specific marker (POI or door) on the map, we
  // record its id so the inspector knows which editor to auto-expand. Also
  // used as the trigger for "auto-expand singletons" when there's only one
  // item on the hex.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [pendingForm, setPendingForm] = useState<
    | { type: 'poi'; hex: HexCoord }
    | { type: 'door'; hex: HexCoord }
    | null
  >(null);

  // Single-source-of-truth selection helpers. Every entry point that
  // changes "what's currently selected" goes through one of these so the
  // four selection-state fields (selectedHex, selectedLayline,
  // focusedItemId, pendingForm) stay mutually consistent.
  const selectHex = useCallback((hex: HexCoord | null, focusedId: string | null = null) => {
    setSelectedHex(hex);
    setFocusedItemId(focusedId);
    setSelectedLayline(null);
    setPendingForm(null);
  }, []);
  const selectLayline = useCallback((id: string | null) => {
    setSelectedLayline(id);
    setSelectedHex(null);
    setFocusedItemId(null);
    setPendingForm(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedHex(null);
    setSelectedLayline(null);
    setFocusedItemId(null);
    setPendingForm(null);
  }, []);

  // Convenience: used by marker onClick handlers (select hex + remember
  // which item the user clicked so the inspector auto-expands its editor).
  const focusItemOnMap = useCallback((hex: HexCoord, itemId: string) => {
    selectHex(hex, itemId);
  }, [selectHex]);

  // Re-center the view on a specific hex without changing zoom. Used by
  // jump-to-hex so a coord typed off-screen brings the hex into view.
  const recenterOnHex = useCallback((hex: HexCoord) => {
    const p = parseCoord(hex);
    if (!p) return;
    const c = hexCenter(p.col, p.row);
    setView((v) => ({ ...v, x: c.x - v.w / 2, y: c.y - v.h / 2 }));
  }, []);

  // Clear focusedItemId once the item it points at no longer exists (e.g.
  // the user deleted it via the inspector). Without this the id sits stale
  // until the next focus/close.
  useEffect(() => {
    if (focusedItemId === null) return;
    const stillExists =
      mapData.pois.some((p) => p.id === focusedItemId) ||
      mapData.fayeDoors.some((d) => d.id === focusedItemId);
    if (!stillExists) setFocusedItemId(null);
  }, [focusedItemId, mapData.pois, mapData.fayeDoors]);

  const panRef = useRef<{
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    scale: number;
    moved: boolean;
  } | null>(null);
  // Set true on the mouseup at the end of a real (moved) pan. Consumed
  // (and cleared) by the very next polygon onClick to suppress the
  // accidental hex selection that would otherwise fire when the user
  // releases shift-drag over a hex.
  const suppressNextClickRef = useRef(false);
  // Separate boolean state mirrors `panRef.current != null` so the cursor
  // style re-renders during a drag. Refs alone don't trigger re-renders,
  // so reading panRef in JSX would always show the pre-drag cursor.
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // `updateMap` and `setDraftLayline` route through the functional form of
  // onChange so that multiple writes in one event tick compose correctly
  // (the second update reads the result of the first, not a stale render
  // snapshot). Without this, a fast typist + Finish click can lose the
  // in-flight keystroke.
  const updateMap = useCallback(
    (updater: (md: CharacterMapData) => CharacterMapData) => {
      onChange((prev) => ({ mapData: updater(prev.mapData) }));
    },
    [onChange],
  );

  const setDraftLayline = useCallback(
    (next: LaylineDraft | null | ((prev: LaylineDraft | null) => LaylineDraft | null)) => {
      updateMap((md) => {
        const resolved = typeof next === 'function' ? next(md.draftLayline ?? null) : next;
        if (resolved === null) {
          if (md.draftLayline === undefined) return md;
          // Strip draftLayline from the object so JSON-serialised state
          // doesn't carry a stale draft. Destructure drops the key cleanly.
          const { draftLayline: _drop, ...rest } = md;
          return rest as CharacterMapData;
        }
        return { ...md, draftLayline: resolved };
      });
    },
    [updateMap],
  );

  const setCurrentLocation = useCallback(
    (hex: HexCoord) => {
      if (!(hex in HEX_CELLS)) return;
      onChange({ currentLocationHex: hex, currentLocation: `Hex ${hex}` });
    },
    [onChange],
  );

  const screenToImage = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      // Use the SVG's own coordinate transform so we account for
      // preserveAspectRatio="meet" letterboxing. Naive (clientX - rect.left)
      // / rect.width math would put the cursor at the wrong image coord
      // whenever the SVG element's aspect ratio doesn't match viewBox.
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const local = pt.matrixTransform(ctm.inverse());
      return { x: local.x, y: local.y };
    },
    [],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (panRef.current) {
        // Convert the screen-pixel drag delta into image units using the
        // letterbox-aware uniform scale. (Naive view.w / rect.width would
        // be wrong whenever the SVG's aspect ratio doesn't match viewBox.)
        const dxPx = e.clientX - panRef.current.startX;
        const dyPx = e.clientY - panRef.current.startY;
        // Mark this pan as "really moved" once the cursor has travelled
        // more than 3px from the start, so that mouseup can decide whether
        // to suppress the impending polygon click.
        if (!panRef.current.moved && Math.hypot(dxPx, dyPx) > PAN_DRAG_THRESHOLD_PX) {
          panRef.current.moved = true;
        }
        const dx = dxPx * panRef.current.scale;
        const dy = dyPx * panRef.current.scale;
        setView((v) => ({ ...v, x: panRef.current!.viewX - dx, y: panRef.current!.viewY - dy }));
        return;
      }
      const img = screenToImage(e.clientX, e.clientY);
      if (!img) return;
      const hex = pixelToHex(img.x, img.y);
      setHoverHex(hex);
    },
    [screenToImage],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      // A fresh interaction (any button) starts — clear any stale
      // click-suppression flag left over from a previous shift-drag that
      // ended over a non-clickable element (the SVG backdrop rect or the
      // letterbox padding). Cleared before the left-button check so a
      // right-click between a stranded drag and the next normal click
      // doesn't leave the flag set.
      suppressNextClickRef.current = false;
      if (e.button !== 0) return;
      // Shift+drag pans the view. Plain clicks fall through to the polygon's
      // own onClick so the user can select a hex. Shift+click WITHOUT
      // movement also falls through (treated as a hex selection).
      // A shift-drag that actually moves the cursor sets `moved` so the
      // mouseup-then-click sequence at the end of the drag can be
      // suppressed (otherwise we'd accidentally select the hex the user
      // released over).
      if (e.shiftKey) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        // Image-units per screen pixel under preserveAspectRatio="meet":
        // the renderer applies a single uniform scale = min(rw/w, rh/h),
        // so its reciprocal is the screen→image conversion factor.
        const scale = 1 / Math.min(rect.width / view.w, rect.height / view.h);
        panRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          viewX: view.x,
          viewY: view.y,
          scale,
          moved: false,
        };
        setIsPanning(true);
        e.preventDefault();
      }
    },
    [view.x, view.y, view.w, view.h],
  );

  const handleMouseUp = useCallback(() => {
    if (panRef.current?.moved) {
      // We just finished a real drag — suppress the click that browsers
      // dispatch on the element under cursor on mouseup, so the hex
      // doesn't get auto-selected at the drag's destination.
      suppressNextClickRef.current = true;
    }
    panRef.current = null;
    setIsPanning(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (panRef.current?.moved) {
      suppressNextClickRef.current = true;
    }
    panRef.current = null;
    setIsPanning(false);
    setHoverHex(null);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      // Cursor's image-coord under the CURRENT view; SVG CTM handles
      // letterboxing so this is the actual point the cursor sits over.
      const cursorImage = screenToImage(e.clientX, e.clientY);
      if (!cursorImage) return;
      const rect = svg.getBoundingClientRect();
      const rawFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        // Couple the two dimensions: instead of clamping w and h
        // independently (which could warp the aspect ratio over time),
        // pick a single scale factor that respects BOTH clamps. Today
        // view.w/view.h is held equal to baseBounds.w/baseBounds.h, so
        // both per-dim clamps yield the same factor; coupling here keeps
        // any future code that nudges one dimension from drifting the
        // viewBox aspect ratio.
        //
        // For zoom-out (rawFactor > 1) the tighter clamp is the smaller
        // factor; for zoom-in (rawFactor < 1) the tighter clamp is the
        // larger factor (closer to 1). Pick accordingly.
        const wFactor = Math.max(
          baseBounds.w * 0.05 / v.w,
          Math.min(baseBounds.w * 1.5 / v.w, rawFactor),
        );
        const hFactor = Math.max(
          baseBounds.h * 0.05 / v.h,
          Math.min(baseBounds.h * 1.5 / v.h, rawFactor),
        );
        const factor = rawFactor > 1
          ? Math.min(wFactor, hFactor)
          : Math.max(wFactor, hFactor);
        const newW = v.w * factor;
        const newH = v.h * factor;
        // Guard: if the cursor sits inside the letterbox PADDING area
        // (rare with a near-square viewBox but possible), cursorImage
        // is outside the viewBox bounds. Anchoring such a point under
        // the new view would drift the viewBox far from the content
        // after a few wheel ticks. Fall back to centred zoom in that case.
        const cursorInView =
          cursorImage.x >= v.x && cursorImage.x <= v.x + v.w &&
          cursorImage.y >= v.y && cursorImage.y <= v.y + v.h;
        if (!cursorInView) {
          // Center-anchored zoom around the existing viewBox center.
          return {
            x: v.x + (v.w - newW) / 2,
            y: v.y + (v.h - newH) / 2,
            w: newW,
            h: newH,
          };
        }
        // Place the new viewBox so cursorImage maps back to the same
        // client coords under the new CTM. Worked out analytically for
        // preserveAspectRatio="xMidYMid meet": scale is uniform =
        // min(rw/w, rh/h), viewBox is centered in the leftover space.
        const newScale = Math.min(rect.width / newW, rect.height / newH);
        const offsetX = (rect.width - newW * newScale) / 2;
        const offsetY = (rect.height - newH * newScale) / 2;
        return {
          x: cursorImage.x - (e.clientX - rect.left - offsetX) / newScale,
          y: cursorImage.y - (e.clientY - rect.top - offsetY) / newScale,
          w: newW,
          h: newH,
        };
      });
    },
    [baseBounds.w, baseBounds.h, screenToImage],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleHexClick = useCallback(
    (hex: HexCoord) => {
      if (drawingLayline) {
        setDraftLayline((draft) => {
          if (!draft) return draft;
          // Click last-added hex: remove it (one-step undo).
          if (draft.hexes[draft.hexes.length - 1] === hex) {
            return { ...draft, hexes: draft.hexes.slice(0, -1) };
          }
          // Click a hex already in the middle of the draft: truncate the
          // draft up to that hex. Lets the user fix a mistaken middle hex
          // without canceling and starting over.
          const idx = draft.hexes.indexOf(hex);
          if (idx >= 0) {
            return { ...draft, hexes: draft.hexes.slice(0, idx + 1) };
          }
          return { ...draft, hexes: [...draft.hexes, hex] };
        });
        return;
      }
      // A polygon click selects the hex (no specific item focus). Goes
      // through the unified selection helper so all four selection-state
      // fields stay consistent.
      selectHex(hex);
    },
    [drawingLayline, setDraftLayline, selectHex],
  );

  const finishLayline = useCallback(() => {
    // Compute the ID once, OUTSIDE the updater, so React StrictMode's
    // double-invocation of the updater produces identical results (same
    // ID both times) — React picks one and we never see a duplicate.
    // Generating inside would mint two different IDs per click.
    const newLineId = newId();
    updateMap((md) => {
      // Read everything from `md` (the fresh state React passes us); no
      // render-closure variables in the commit path, so a keystroke that
      // lands between render and click can't be lost.
      const fresh = md.draftLayline;
      // Nothing to commit AND nothing to clear → return the same `md` so
      // React skips the state update and we don't churn localStorage.
      if (!fresh) return md;
      // Drop the draft from the mapData object on commit.
      const { draftLayline: _drop, ...rest } = md;
      // Below-2-hex finish behaves like a cancel — clear the draft only.
      if (fresh.hexes.length < 2) return rest as CharacterMapData;
      const newLine: Layline = {
        id: newLineId,
        type: fresh.type || 'Layline',
        name: fresh.name || 'Unnamed Layline',
        color: fresh.color,
        hexes: fresh.hexes,
        notes: fresh.notes,
      };
      return { ...rest, laylines: [...md.laylines, newLine] };
    });
  }, [updateMap]);

  const cancelLayline = useCallback(() => setDraftLayline(null), [setDraftLayline]);

  const contentsByHex = useMemo(() => {
    const map = new Map<HexCoord, { pois: MapPOI[]; doors: FayeDoor[] }>();
    for (const p of mapData.pois) {
      const e = map.get(p.hex) ?? { pois: [], doors: [] };
      e.pois.push(p);
      map.set(p.hex, e);
    }
    for (const d of mapData.fayeDoors) {
      const e = map.get(d.hex) ?? { pois: [], doors: [] };
      e.doors.push(d);
      map.set(d.hex, e);
    }
    return map;
  }, [mapData]);

  const renderHex = (coord: HexCoord) => {
    const cell = HEX_CELLS[coord];
    const verts = hexVertices(cell.col, cell.row);
    const points = verts.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
    const isCurrent = character.currentLocationHex === coord;
    const isHover = hoverHex === coord;
    const isSelected = selectedHex === coord;
    const isInDraft = drawingLayline?.hexes.includes(coord) ?? false;
    const center = hexCenter(cell.col, cell.row);

    return (
      <g key={coord}>
        <polygon
          points={points}
          fill={TERRAIN_FILL[cell.terrain] ?? TERRAIN_FILL.open}
          stroke={isCurrent ? '#c4a35a' : isHover || isSelected ? '#f5e6c8' : TERRAIN_STROKE}
          strokeWidth={isCurrent ? 6 : isHover || isSelected ? 4 : 2}
          opacity={isInDraft ? 0.85 : 1}
          // role="img" + aria-label exposes the hex to screen readers but
          // keeps it OUT of the keyboard tab order — putting all ~200 hex
          // polygons in the tab sequence would dominate every Tab press
          // across the page. Markers (POIs / Faye doors / laylines) ARE
          // tabbable since there are only a handful of those per character.
          // Mouse / touch users keep direct activation via the click handler.
          role="img"
          aria-label={`Hex ${coord}${isCurrent ? ', current location' : ''}, terrain ${cell.terrain}`}
          onClick={(e) => {
            e.stopPropagation();
            // Drop the synthetic click that fires at the end of a shift-drag
            // pan; otherwise the destination hex gets accidentally selected.
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false;
              return;
            }
            handleHexClick(coord);
          }}
          style={{ cursor: drawingLayline ? 'crosshair' : 'pointer' }}
        />
        {isInDraft && (
          <text
            x={center.x}
            y={center.y + HEX_GRID_META.hexSize * 0.1}
            textAnchor="middle"
            fontSize="50"
            fill="#1a1a2e"
            fontWeight="bold"
            pointerEvents="none"
          >
            {drawingLayline!.hexes.indexOf(coord) + 1}
          </text>
        )}
        {/* Coordinate label near the top of the hex. Always rendered;
            opacity fades out at low zoom so dense maps don't drown in text. */}
        <text
          x={center.x}
          y={center.y - HEX_GRID_META.hexSize * 0.55}
          textAnchor="middle"
          fontSize="30"
          fill="#f5e6c8"
          opacity={Math.max(
            COORD_LABEL_OPACITY_MIN,
            Math.min(COORD_LABEL_OPACITY_MAX, 1 - view.w / (baseBounds.w * COORD_LABEL_FADE_AT)),
          )}
          pointerEvents="none"
        >
          {coord}
        </text>
      </g>
    );
  };

  const polylinePoints = (hexes: HexCoord[]) =>
    hexes
      .map((h) => {
        const p = parseCoord(h);
        if (!p) return null;
        const c = hexCenter(p.col, p.row);
        return `${c.x.toFixed(1)},${c.y.toFixed(1)}`;
      })
      .filter((s): s is string => s !== null)
      .join(' ');

  const renderLaylines = () => {
    const lines: React.ReactElement[] = [];
    for (const ll of mapData.laylines) {
      if (ll.hexes.length < 2) continue;
      const notesSnippet = ll.notes ? ` — ${ll.notes.slice(0, 120)}` : '';
      const label = `${ll.type || 'Layline'}: ${ll.name || 'Unnamed'}${notesSnippet}`;
      const toggleSelect = () => {
        // Drop the synthetic click that ends a shift-drag pan.
        if (suppressNextClickRef.current) {
          suppressNextClickRef.current = false;
          return;
        }
        // Toggle: clicking the already-selected layline deselects it.
        // Goes through the unified selection helpers so the hex inspector
        // and focused-item state are cleared in lock-step.
        if (selectedLayline === ll.id) clearSelection();
        else selectLayline(ll.id);
      };
      lines.push(
        <g key={ll.id} role="button" tabIndex={0} aria-label={label}
          style={{ cursor: 'pointer' }}
          className="focus-visible:outline-2 focus-visible:outline-[#c4a35a] focus-visible:outline-offset-2"
          onClick={(e) => { e.stopPropagation(); toggleSelect(); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              toggleSelect();
            }
          }}>
          <title>{label}</title>
          <polyline
            points={polylinePoints(ll.hexes)}
            fill="none"
            stroke={ll.color}
            strokeWidth={14}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={selectedLayline && selectedLayline !== ll.id ? 0.35 : 0.9}
          />
        </g>,
      );
    }
    if (drawingLayline && drawingLayline.hexes.length >= 2) {
      lines.push(
        <polyline
          key="draft"
          points={polylinePoints(drawingLayline.hexes)}
          fill="none"
          stroke={drawingLayline.color}
          strokeWidth={14}
          strokeDasharray="20 12"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.85}
          pointerEvents="none"
        />,
      );
    }
    return lines;
  };

  const renderDoorConnectors = () => {
    const seen = new Set<string>();
    const out: React.ReactElement[] = [];
    for (const d of mapData.fayeDoors) {
      if (d.destination.kind !== 'roaded') continue;
      const otherId = d.destination.pairedDoorId;
      const pairKey = [d.id, otherId].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const other = mapData.fayeDoors.find((x) => x.id === otherId);
      if (!other) continue;
      const a = parseCoord(d.hex);
      const b = parseCoord(other.hex);
      if (!a || !b) continue;
      const ca = hexCenter(a.col, a.row);
      const cb = hexCenter(b.col, b.row);
      const mx = (ca.x + cb.x) / 2;
      const my = (ca.y + cb.y) / 2;
      out.push(
        <g key={pairKey}>
          <line
            x1={ca.x}
            y1={ca.y}
            x2={cb.x}
            y2={cb.y}
            stroke="#a774d6"
            strokeWidth={8}
            strokeDasharray="20 14"
            opacity={0.75}
            pointerEvents="none"
          />
          {d.destination.roadName && (
            <text
              x={mx}
              y={my - 14}
              textAnchor="middle"
              fontSize="34"
              fill="#a774d6"
              fontWeight="bold"
              pointerEvents="none"
              style={{ paintOrder: 'stroke fill', stroke: '#1a1a2e', strokeWidth: 6 }}
            >
              {d.destination.roadName}
            </text>
          )}
        </g>,
      );
    }
    return out;
  };

  const renderMarkers = () => {
    const els: React.ReactElement[] = [];
    if (character.currentLocationHex) {
      const cl = parseCoord(character.currentLocationHex);
      if (cl) {
        const { x, y } = hexCenter(cl.col, cl.row);
        els.push(
          <circle
            key="current-loc"
            cx={x}
            cy={y}
            r={42}
            fill="#c4a35a"
            stroke="#f5e6c8"
            strokeWidth={6}
            pointerEvents="none"
          />,
          <text
            key="current-loc-icon"
            x={x}
            y={y + 18}
            textAnchor="middle"
            fontSize="56"
            fill="#1a1a2e"
            fontWeight="bold"
            pointerEvents="none"
          >
            ★
          </text>,
        );
      }
    }
    // Show at most this many markers per hex; the rest collapse into a
    // "+N" badge so a busy hex doesn't degenerate into overlapping circles.
    const MAX_VISIBLE_MARKERS = 4;
    contentsByHex.forEach((bucket, hex) => {
      const p = parseCoord(hex);
      if (!p) return;
      const { x, y } = hexCenter(p.col, p.row);
      const items = [
        ...bucket.pois.map((poi) => ({ kind: 'poi' as const, item: poi })),
        ...bucket.doors.map((door) => ({ kind: 'door' as const, item: door })),
      ];
      const visible = items.slice(0, MAX_VISIBLE_MARKERS);
      const overflow = items.length - visible.length;
      const slotCount = visible.length + (overflow > 0 ? 1 : 0);
      visible.forEach((entry, i) => {
        const angle = slotCount === 1 ? -Math.PI / 2 : -Math.PI / 2 + (i / slotCount) * Math.PI * 2;
        const r = slotCount === 1 ? 0 : 42;
        const mx = x + r * Math.cos(angle);
        const my = y + r * Math.sin(angle);
        // Marker activation routes to either focusItemOnMap (default) or
        // handleHexClick (when a layline draft is in progress, so the user
        // can include a decorated hex in their layline without the marker
        // hijacking the click). Also drops the synthetic click that ends
        // a shift-drag pan, matching the polygon click handler.
        const activateMarker = (itemId: string) => {
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          if (drawingLayline) {
            handleHexClick(hex);
          } else {
            focusItemOnMap(hex, itemId);
          }
        };

        if (entry.kind === 'poi') {
          // SVG <title> renders as a native browser tooltip on hover.
          // `role="button"` + `tabIndex` + `aria-label` make the marker
          // keyboard-operable and announceable.
          const notesSnippet = entry.item.notes ? ` — ${entry.item.notes.slice(0, 120)}` : '';
          const label = `POI: ${entry.item.name || 'Unnamed'}${notesSnippet}`;
          els.push(
            <g key={`poi-${entry.item.id}`} role="button" tabIndex={0} aria-label={label}
              style={{ cursor: 'pointer' }}
              className="focus-visible:outline-2 focus-visible:outline-[#c4a35a] focus-visible:outline-offset-2"
              onClick={(e) => { e.stopPropagation(); activateMarker(entry.item.id); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  activateMarker(entry.item.id);
                }
              }}>
              <title>{label}</title>
              <circle cx={mx} cy={my} r={22} fill="#8b2500" stroke="#f5e6c8" strokeWidth={4} />
            </g>,
          );
        } else {
          const door = entry.item;
          const dest = door.destination;
          const destLabel = dest.kind === 'wild'
            ? 'wild → fey realm'
            : `roaded${dest.roadName ? ` via "${dest.roadName}"` : ''}`;
          const notesSnippet = door.notes ? ` — ${door.notes.slice(0, 120)}` : '';
          const label = `Faye Door: ${door.name || 'Unnamed'} (${destLabel})${notesSnippet}`;
          els.push(
            <g key={`door-${door.id}`} role="button" tabIndex={0} aria-label={label}
              style={{ cursor: 'pointer' }}
              className="focus-visible:outline-2 focus-visible:outline-[#c4a35a] focus-visible:outline-offset-2"
              onClick={(e) => { e.stopPropagation(); activateMarker(door.id); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  activateMarker(door.id);
                }
              }}>
              <title>{label}</title>
              <circle cx={mx} cy={my} r={26} fill="#a774d6" stroke="#f5e6c8" strokeWidth={4} />
              <text x={mx} y={my + 12} textAnchor="middle" fontSize="38" fill="#1a1a2e" fontWeight="bold"
                pointerEvents="none">
                ✦
              </text>
            </g>,
          );
        }
      });
      if (overflow > 0) {
        // Overflow badge sits in the slot after the last visible marker.
        const i = visible.length;
        const angle = -Math.PI / 2 + (i / slotCount) * Math.PI * 2;
        const mx = x + 42 * Math.cos(angle);
        const my = y + 42 * Math.sin(angle);
        els.push(
          <g key={`overflow-${hex}`} pointerEvents="none">
            <circle cx={mx} cy={my} r={24} fill="#1a1a2e" stroke="#f5e6c8" strokeWidth={3} />
            <text x={mx} y={my + 10} textAnchor="middle" fontSize="28" fill="#f5e6c8" fontWeight="bold">
              +{overflow}
            </text>
          </g>,
        );
      }
    });
    return els;
  };

  const resetView = () => setView({ x: baseBounds.x, y: baseBounds.y, w: baseBounds.w, h: baseBounds.h });

  const startLayline = () => {
    setDraftLayline({
      name: '',
      type: 'Layline',
      color: DEFAULT_LAYLINE_COLORS[mapData.laylines.length % DEFAULT_LAYLINE_COLORS.length],
      notes: '',
      hexes: [],
    });
    // Use the unified helper so focusedItemId / pendingForm get cleared
    // alongside the hex+layline selection (otherwise a partly-filled door
    // form or marker focus would survive into the draft session).
    clearSelection();
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#5a3a28] pb-2 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-[#c4a35a]">Dolmenwood Map</h2>
          <div className="flex items-center gap-3 text-xs text-[#f5e6c8]/80">
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TERRAIN_FILL.woods }} /> Woods
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TERRAIN_FILL.open }} /> Open
            </div>
            <button onClick={resetView} className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 transition-colors">
              Reset View
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {!drawingLayline ? (
            <button onClick={startLayline} className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors">
              ≈ Draw Layline
            </button>
          ) : (
            <>
              <span className="text-[#c4a35a] font-semibold">
                Drawing layline ({drawingLayline.hexes.length} hex{drawingLayline.hexes.length === 1 ? '' : 'es'})
              </span>
              <button
                onClick={finishLayline}
                disabled={drawingLayline.hexes.length < 2}
                className="bg-[#c4a35a] disabled:opacity-40 hover:bg-[#d4b66a] text-[#1a1a2e] font-semibold rounded px-3 py-1 transition-colors"
              >
                Finish
              </button>
              <button onClick={cancelLayline} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
                Cancel
              </button>
            </>
          )}
          {/* Keyboard entry point: hex polygons aren't in the tab order
              (199 of them would dominate every Tab press), so this input
              lets keyboard-only users open the inspector for any hex by
              typing its coord (e.g. "0303"). Routes through handleHexClick
              so it respects the layline-draft branch and the unified
              selection contract. Also re-centres the viewBox so a jumped
              hex doesn't sit off-screen. */}
          <JumpToHexInput
            drafting={drawingLayline !== null}
            onJump={(hex) => { recenterOnHex(hex); handleHexClick(hex); }}
          />
          {/* Draft-specific guidance lives inside LaylineDraftForm; the
              toolbar hint is suppressed while drafting to avoid duplicating
              the same message in two places. */}
          {!drawingLayline && (
            <span className="text-[#f5e6c8]/40 text-xs ml-auto basis-full md:basis-auto md:whitespace-nowrap">
              Scroll to zoom · Shift-drag to pan · Click a hex to inspect · Hover a marker for details
            </span>
          )}
        </div>
        {drawingLayline && <LaylineDraftForm draft={drawingLayline} setDraft={setDraftLayline} />}
      </div>

      <div className="bg-[#1a1a2e] rounded-lg overflow-hidden relative" style={{ height: '60vh' }}>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full select-none"
          style={{ cursor: isPanning ? 'grabbing' : drawingLayline ? 'crosshair' : 'default' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          <rect
            x={baseBounds.x}
            y={baseBounds.y}
            width={baseBounds.w}
            height={baseBounds.h}
            fill="#1a1a2e"
          />
          <g>{ALL_HEXES.map(renderHex)}</g>
          <g>{renderLaylines()}</g>
          <g>{renderDoorConnectors()}</g>
          <g>{renderMarkers()}</g>
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <HexInspectorPanel
          selectedHex={selectedHex}
          mapData={mapData}
          contentsByHex={contentsByHex}
          updateMap={updateMap}
          pendingForm={pendingForm}
          setPendingForm={setPendingForm}
          currentLocationHex={character.currentLocationHex}
          setCurrentLocation={setCurrentLocation}
          focusedItemId={focusedItemId}
          onClose={clearSelection}
        />
        <LaylinesPanel
          mapData={mapData}
          updateMap={updateMap}
          selectedLayline={selectedLayline}
          // Toggle through the unified selection helpers so the hex
          // inspector / focused-item / pending form clear in lock-step.
          onToggleSelected={(id) => (selectedLayline === id ? clearSelection() : selectLayline(id))}
        />
      </div>
    </div>
  );
}

// --- Layline draft form ---
// --- Jump-to-hex input (toolbar) ---
// Accessibility entry point: lets keyboard-only users open the inspector
// for any hex by typing its 4-digit coord. Short input (e.g. "33") is
// left-padded to "0033" so casual typing works. Invalid input (out-of-
// manifest coord or non-numeric) sets a transient `invalid` flag that
// the caller can see via aria-invalid + a red border; cleared on the
// next keystroke or after a short timeout.
function JumpToHexInput({
  drafting,
  onJump,
}: {
  drafting: boolean;
  onJump: (hex: HexCoord) => void;
}) {
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const raw = value.trim();
    const ok = /^\d{1,4}$/.test(raw);
    const hex = ok ? raw.padStart(4, '0') : raw;
    if (!ok || !(hex in HEX_CELLS)) {
      setInvalid(true);
      return;
    }
    onJump(hex);
    setValue('');
    setInvalid(false);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        if (invalid) setInvalid(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
      }}
      placeholder={drafting ? 'Add to layline' : 'Go to hex'}
      aria-label={
        drafting
          ? 'Add a hex to the in-progress layline by typing its coordinate'
          : 'Jump to a hex by typing its 4-digit coordinate'
      }
      aria-invalid={invalid || undefined}
      className={`bg-[#1a1a2e] border ${invalid ? 'border-[#8b2500]' : 'border-[#5a3a28]'} text-[#f5e6c8] rounded px-2 py-1 text-xs w-28 focus:outline-none focus:border-[#c4a35a]`}
    />
  );
}

function LaylineDraftForm({
  draft,
  setDraft,
}: {
  draft: LaylineDraft;
  setDraft: (d: LaylineDraft) => void;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-[#5a3a28] grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <input
        value={draft.name}
        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Name"
        className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]"
      />
      <input
        value={draft.type}
        onChange={(e) => setDraft({ ...draft, type: e.target.value })}
        placeholder="Type (Layline, Ward…)"
        className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]"
      />
      <input
        type="color"
        value={draft.color}
        onChange={(e) => setDraft({ ...draft, color: e.target.value })}
        className="bg-[#1a1a2e] border border-[#5a3a28] rounded h-8 w-full"
      />
      <input
        value={draft.notes}
        onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Notes"
        className="bg-[#1a1a2e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 focus:outline-none focus:border-[#c4a35a]"
      />
      <div className="col-span-full text-xs text-[#f5e6c8]/60">
        Click hexes in order. Click the last-added hex to undo it; click any earlier draft hex to truncate from that point.
      </div>
    </div>
  );
}

// --- Hex inspector ---
function HexInspectorPanel({
  selectedHex,
  mapData,
  contentsByHex,
  updateMap,
  pendingForm,
  setPendingForm,
  currentLocationHex,
  setCurrentLocation,
  focusedItemId,
  onClose,
}: {
  selectedHex: HexCoord | null;
  mapData: CharacterMapData;
  contentsByHex: Map<HexCoord, { pois: MapPOI[]; doors: FayeDoor[] }>;
  updateMap: (fn: (md: CharacterMapData) => CharacterMapData) => void;
  pendingForm: { type: 'poi' | 'door'; hex: HexCoord } | null;
  setPendingForm: (f: { type: 'poi' | 'door'; hex: HexCoord } | null) => void;
  currentLocationHex: HexCoord | '';
  setCurrentLocation: (h: HexCoord) => void;
  focusedItemId: string | null;
  onClose: () => void;
}) {
  if (!selectedHex) {
    return (
      <div className="bg-[#2a2a3e] rounded-lg p-4 text-sm text-[#f5e6c8]/50 italic">
        Click a hex on the map to inspect it.
      </div>
    );
  }
  const bucket = contentsByHex.get(selectedHex);
  const pois = bucket?.pois ?? [];
  const doors = bucket?.doors ?? [];
  const cell = HEX_CELLS[selectedHex];
  const isCurrent = currentLocationHex === selectedHex;

  // The action area at the top is either:
  //   - the action button row (default), OR
  //   - the active form (POI / Door), which takes its place when the user
  //     picks an action. Submit/Cancel returns to the button row.
  const activeForm = pendingForm?.hex === selectedHex ? pendingForm.type : null;

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-[#5a3a28] pb-2">
        <div>
          <span className="text-[#c4a35a] font-bold">Hex {selectedHex}</span>
          <span className="text-[#f5e6c8]/60 text-xs ml-2">{cell?.terrain}</span>
          {isCurrent && <span className="text-[#c4a35a] text-xs ml-2">★ current</span>}
        </div>
        <button
          onClick={onClose}
          aria-label="Close hex inspector"
          className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-xs transition-colors"
        >
          ✕
        </button>
      </div>

      {activeForm === 'poi' && (
        <POIForm
          hex={selectedHex}
          onSubmit={(poi) => {
            updateMap((md) => ({ ...md, pois: [...md.pois, poi] }));
            setPendingForm(null);
          }}
          onCancel={() => setPendingForm(null)}
        />
      )}
      {activeForm === 'door' && (
        <DoorForm
          hex={selectedHex}
          existingDoors={mapData.fayeDoors}
          onSubmit={(door, pairUpdates) => {
            updateMap((md) => ({
              ...md,
              fayeDoors: [
                ...md.fayeDoors.map((x) => pairUpdates.find((u) => u.id === x.id) ?? x),
                door,
              ],
            }));
            setPendingForm(null);
          }}
          onCancel={() => setPendingForm(null)}
        />
      )}
      {activeForm === null && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          <button
            onClick={() => setCurrentLocation(selectedHex)}
            disabled={isCurrent}
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-40 disabled:hover:bg-[#2d4a2e] text-[#f5e6c8] rounded px-3 py-2 transition-colors"
          >
            📍 Set Current
          </button>
          <button
            onClick={() => setPendingForm({ type: 'poi', hex: selectedHex })}
            className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-3 py-2 transition-colors"
          >
            + POI
          </button>
          <button
            onClick={() => setPendingForm({ type: 'door', hex: selectedHex })}
            className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-3 py-2 transition-colors"
          >
            ✦ Faye Door
          </button>
        </div>
      )}

      {(pois.length > 0 || doors.length > 0) && (
        <div className="space-y-3 pt-1 border-t border-[#5a3a28]">
          {pois.length > 0 && (
            <div>
              <h4 className="text-[#c4a35a] text-xs uppercase tracking-wide font-semibold mb-1">
                Points of Interest
              </h4>
              <div className="space-y-2">
                {pois.map((p) => (
                  <POIEditor
                    key={p.id}
                    poi={p}
                    // Auto-expand when this is the focused item (user clicked
                    // its marker) or when it's the only POI on the hex.
                    initiallyExpanded={focusedItemId === p.id || (pois.length === 1 && doors.length === 0)}
                    onSave={(updated) =>
                      updateMap((md) => ({
                        ...md,
                        pois: md.pois.map((x) => (x.id === updated.id ? updated : x)),
                      }))
                    }
                    onDelete={() =>
                      updateMap((md) => ({ ...md, pois: md.pois.filter((x) => x.id !== p.id) }))
                    }
                  />
                ))}
              </div>
            </div>
          )}
          {doors.length > 0 && (
            <div>
              <h4 className="text-[#c4a35a] text-xs uppercase tracking-wide font-semibold mb-1">
                Faye Doors
              </h4>
              <div className="space-y-2">
                {doors.map((d) => (
                  <DoorEditor
                    key={d.id}
                    door={d}
                    allDoors={mapData.fayeDoors}
                    initiallyExpanded={focusedItemId === d.id || (doors.length === 1 && pois.length === 0)}
                    onSave={(updated, pairUpdates) =>
                      updateMap((md) => ({
                        ...md,
                        fayeDoors: md.fayeDoors.map((x) => {
                          if (x.id === updated.id) return updated;
                          const u = pairUpdates.find((p) => p.id === x.id);
                          return u ?? x;
                        }),
                      }))
                    }
                    onDelete={() =>
                      updateMap((md) => ({
                        ...md,
                        fayeDoors: md.fayeDoors
                          .filter((x) => x.id !== d.id)
                          .map((x) => {
                            if (x.destination.kind === 'roaded' && x.destination.pairedDoorId === d.id) {
                              return { ...x, destination: { kind: 'wild' } };
                            }
                            return x;
                          }),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- POI form / editor ---
function POIForm({
  hex,
  onSubmit,
  onCancel,
}: {
  hex: HexCoord;
  onSubmit: (p: MapPOI) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const submit = () => {
    if (!name.trim()) return onCancel();
    onSubmit({ id: newId(), hex, name: name.trim(), notes: notes.trim() });
  };
  return (
    <div className="bg-[#1a1a2e] rounded p-2 mb-2 space-y-1">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Name"
        className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        rows={2}
        className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
      />
      <div className="flex justify-end gap-2 text-xs">
        <button onClick={onCancel} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function POIEditor({
  poi,
  initiallyExpanded = false,
  onSave,
  onDelete,
}: {
  poi: MapPOI;
  initiallyExpanded?: boolean;
  onSave: (p: MapPOI) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(poi.name);
  const [notes, setNotes] = useState(poi.notes);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const dirty = name !== poi.name || notes !== poi.notes;
  // Sync local edit state when the underlying poi prop changes externally
  // (e.g. another writer mutated the same record, or the user clicked a
  // marker that re-focuses this editor with a fresh poi reference).
  useEffect(() => {
    setName(poi.name);
    setNotes(poi.notes);
  }, [poi.id, poi.name, poi.notes]);
  // Expand when `initiallyExpanded` flips on (e.g. marker click while the
  // editor is already mounted). We never auto-collapse — the user can do that.
  useEffect(() => {
    if (initiallyExpanded) setExpanded(true);
  }, [initiallyExpanded]);
  return (
    <div className="bg-[#1a1a2e] rounded p-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#8b2500] shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => dirty && onSave({ ...poi, name, notes })}
          className="flex-1 bg-transparent text-[#f5e6c8] text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors"
        >
          {expanded ? 'Less' : 'Notes'}
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete POI ${poi.name || 'unnamed'}`}
          className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors"
        >
          Del
        </button>
      </div>
      {expanded && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => dirty && onSave({ ...poi, name, notes })}
          placeholder="Notes"
          rows={3}
          className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#c4a35a]"
        />
      )}
    </div>
  );
}

// --- Faye door form / editor ---
function DoorForm({
  hex,
  existingDoors,
  onSubmit,
  onCancel,
}: {
  hex: HexCoord;
  existingDoors: FayeDoor[];
  onSubmit: (d: FayeDoor, pairUpdates: FayeDoor[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<'wild' | 'roaded'>('wild');
  const [pairedDoorId, setPairedDoorId] = useState('');
  const [roadName, setRoadName] = useState('');

  // Excludes wild doors already targeted by another door and roaded doors
  // still attached to a live partner; selfId is null because this is a
  // brand-new door that doesn't yet exist in existingDoors.
  const pairable = pairableDoors(existingDoors, null);

  const submit = () => {
    if (!name.trim()) return onCancel();
    const newDoorId = newId();
    let destination: FayeDoorDestination;
    if (kind === 'wild') {
      destination = { kind: 'wild' };
    } else {
      // Belt-and-suspenders: the Save / Add button is `disabled` whenever
      // pairedDoorId is empty in roaded mode, so this silent return is
      // only reachable if a future change loses that disabled state or
      // someone activates the button programmatically.
      if (!pairedDoorId) return;
      destination = { kind: 'roaded', pairedDoorId, roadName: roadName.trim() };
    }
    // The new door starts wild from the partner-update calculation's
    // perspective; computePartnerUpdates handles re-pointing the chosen
    // partner and clearing any prior partner of theirs.
    const pairUpdates = computePartnerUpdates(newDoorId, { kind: 'wild' }, destination, existingDoors);
    onSubmit(
      { id: newDoorId, hex, name: name.trim(), notes: notes.trim(), destination },
      pairUpdates,
    );
  };

  return (
    <div className="bg-[#1a1a2e] rounded p-2 mb-2 space-y-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Door in the Old Oak)"
        className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
      />
      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={kind === 'wild'} onChange={() => setKind('wild')} />
          Wild (into the fey realm)
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="radio" checked={kind === 'roaded'} onChange={() => setKind('roaded')} />
          Roaded (paired)
        </label>
      </div>
      {kind === 'roaded' && (
        <div className="space-y-1">
          <select
            value={pairedDoorId}
            onChange={(e) => setPairedDoorId(e.target.value)}
            className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm"
          >
            <option value="">— pick the door at the other end —</option>
            {pairable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || 'Unnamed'} ({d.hex})
              </option>
            ))}
          </select>
          <input
            value={roadName}
            onChange={(e) => setRoadName(e.target.value)}
            placeholder="Road name (e.g. The Silver Road)"
            className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
          />
        </div>
      )}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        rows={2}
        className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-sm focus:outline-none focus:border-[#c4a35a]"
      />
      <div className="flex justify-end gap-2 text-xs">
        <button onClick={onCancel} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={kind === 'roaded' && !pairedDoorId}
          className="bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-40 text-[#f5e6c8] rounded px-3 py-1 transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function DoorEditor({
  door,
  allDoors,
  initiallyExpanded = false,
  onSave,
  onDelete,
}: {
  door: FayeDoor;
  allDoors: FayeDoor[];
  initiallyExpanded?: boolean;
  onSave: (d: FayeDoor, pairUpdates: FayeDoor[]) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(door.name);
  const [notes, setNotes] = useState(door.notes);
  const [destKind, setDestKind] = useState<'wild' | 'roaded'>(door.destination.kind);
  const [pairedDoorId, setPairedDoorId] = useState(
    door.destination.kind === 'roaded' ? door.destination.pairedDoorId : '',
  );
  const [roadName, setRoadName] = useState(
    door.destination.kind === 'roaded' ? door.destination.roadName : '',
  );
  const [expanded, setExpanded] = useState(initiallyExpanded);

  // Sync local state with external prop changes (another writer, or a marker
  // click bringing this editor into focus with a fresh door reference).
  useEffect(() => {
    setName(door.name);
    setNotes(door.notes);
    setDestKind(door.destination.kind);
    if (door.destination.kind === 'roaded') {
      setPairedDoorId(door.destination.pairedDoorId);
      setRoadName(door.destination.roadName);
    }
  }, [door.id, door.name, door.notes, door.destination]);
  useEffect(() => {
    if (initiallyExpanded) setExpanded(true);
  }, [initiallyExpanded]);

  const partner = useMemo(() => {
    if (door.destination.kind !== 'roaded') return null;
    const paired = door.destination.pairedDoorId;
    return allDoors.find((d) => d.id === paired) ?? null;
  }, [door.destination, allDoors]);
  const pairable = useMemo(() => pairableDoors(allDoors, door.id), [allDoors, door.id]);

  // Text-only save: persists name/notes without touching destination or partners.
  // Used by onBlur on the name/notes inputs so a half-typed roaded form
  // (no pair selected yet) doesn't drop edits, and so partner records aren't
  // churned with redundant pair-updates on every keystroke.
  const saveText = () => {
    if (name === door.name && notes === door.notes) return;
    onSave({ ...door, name, notes }, []);
  };

  // Full save: applies destination changes and keeps both sides of every
  // affected pair in sync via computePartnerUpdates (which also handles
  // clearing a *new* partner's prior partner — that orphan case the
  // previous code missed).
  const saveAll = () => {
    let destination: FayeDoorDestination;
    if (destKind === 'wild') {
      destination = { kind: 'wild' };
    } else {
      // Belt-and-suspenders: the Save / Add button is `disabled` whenever
      // pairedDoorId is empty in roaded mode, so this silent return is
      // only reachable if a future change loses that disabled state or
      // someone activates the button programmatically.
      if (!pairedDoorId) return;
      destination = { kind: 'roaded', pairedDoorId, roadName: roadName.trim() };
    }
    const pairUpdates = computePartnerUpdates(door.id, door.destination, destination, allDoors);
    onSave({ ...door, name, notes, destination }, pairUpdates);
  };

  return (
    <div className="bg-[#1a1a2e] rounded p-2 space-y-1">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#a774d6] shrink-0" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveText}
          className="flex-1 bg-transparent text-[#f5e6c8] text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <span className="text-xs text-[#f5e6c8]/40">
          {door.destination.kind === 'wild' ? 'wild' : `→ ${partner?.hex ?? '?'}`}
        </span>
        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors"
        >
          {expanded ? 'Less' : 'Edit'}
        </button>
        <button
          onClick={onDelete}
          aria-label={`Delete Faye door ${door.name || 'unnamed'}`}
          className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors"
        >
          Del
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 pt-1">
          {/* When the user toggles back to roaded after going wild, the prior
              pairedDoorId/roadName values stay in local state — pleasant UX
              for "I changed my mind." If the prior partner is gone, the
              <select> below shows "— pick paired door —" because the option
              list filters to live, pairable doors. */}
          <div className="flex gap-3 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={destKind === 'wild'} onChange={() => setDestKind('wild')} />
              Wild
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" checked={destKind === 'roaded'} onChange={() => setDestKind('roaded')} />
              Roaded
            </label>
          </div>
          {destKind === 'roaded' && (
            <>
              <select
                value={pairedDoorId}
                onChange={(e) => setPairedDoorId(e.target.value)}
                className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-xs"
              >
                <option value="">— pick paired door —</option>
                {pairable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || 'Unnamed'} ({d.hex})
                  </option>
                ))}
              </select>
              <input
                value={roadName}
                onChange={(e) => setRoadName(e.target.value)}
                placeholder="Road name"
                className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#c4a35a]"
              />
            </>
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveText}
            placeholder="Notes"
            rows={2}
            className="w-full bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#c4a35a]"
          />
          <div className="flex justify-end">
            <button
              onClick={saveAll}
              disabled={destKind === 'roaded' && !pairedDoorId}
              className="bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-40 text-[#f5e6c8] rounded px-3 py-1 text-xs transition-colors"
            >
              Save destination
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Laylines list panel ---
function LaylinesPanel({
  mapData,
  updateMap,
  selectedLayline,
  onToggleSelected,
}: {
  mapData: CharacterMapData;
  updateMap: (fn: (md: CharacterMapData) => CharacterMapData) => void;
  selectedLayline: string | null;
  // Toggle this layline's selected state. Goes through the parent's
  // unified selection helpers so all four selection-state fields stay
  // mutually consistent.
  onToggleSelected: (id: string) => void;
}) {
  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h3 className="text-[#c4a35a] text-sm font-semibold mb-2 border-b border-[#5a3a28] pb-1">
        Laylines &amp; Crossings
      </h3>
      {mapData.laylines.length === 0 ? (
        <div className="text-xs text-[#f5e6c8]/40 italic">None yet. Use “Draw Layline” above.</div>
      ) : (
        <div className="space-y-2">
          {mapData.laylines.map((ll) => (
            <LaylineEditor
              key={ll.id}
              layline={ll}
              selected={selectedLayline === ll.id}
              onSelect={() => onToggleSelected(ll.id)}
              onSave={(updated) =>
                updateMap((md) => ({
                  ...md,
                  laylines: md.laylines.map((x) => (x.id === updated.id ? updated : x)),
                }))
              }
              onDelete={() =>
                updateMap((md) => ({
                  ...md,
                  laylines: md.laylines.filter((x) => x.id !== ll.id),
                }))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LaylineEditor({
  layline,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  layline: Layline;
  selected: boolean;
  onSelect: () => void;
  onSave: (l: Layline) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(layline.name);
  const [type, setType] = useState(layline.type);
  const [color, setColor] = useState(layline.color);
  const [notes, setNotes] = useState(layline.notes);
  // Sync local state with external prop changes (parity with POIEditor and
  // DoorEditor). Today no path mutates a layline outside this editor, but
  // an import or multi-tab write could desync otherwise.
  useEffect(() => {
    setName(layline.name);
    setType(layline.type);
    setColor(layline.color);
    setNotes(layline.notes);
  }, [layline.id, layline.name, layline.type, layline.color, layline.notes]);
  return (
    <div className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${selected ? 'ring-1 ring-[#c4a35a]/60' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Toggle highlight for ${layline.name || 'unnamed layline'}`}
          className="w-3 h-3 rounded-full shrink-0 border border-[#f5e6c8]/40"
          style={{ background: color }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onSave({ ...layline, name, type, color, notes })}
          className="flex-1 bg-transparent text-[#f5e6c8] text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <span className="text-xs text-[#f5e6c8]/40">
          {layline.hexes.length} hex{layline.hexes.length === 1 ? '' : 'es'}
        </span>
        <button
          onClick={onDelete}
          aria-label={`Delete layline ${layline.name || 'unnamed'}`}
          className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors"
        >
          Del
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 text-xs">
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          onBlur={() => onSave({ ...layline, name, type, color, notes })}
          placeholder="Type"
          className="bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-0.5 focus:outline-none focus:border-[#c4a35a]"
        />
        <input
          type="color"
          value={color}
          // Save via onChange (which fires continuously while the picker is
          // open, giving a live preview); no onBlur — that would just
          // duplicate the final write.
          onChange={(e) => {
            setColor(e.target.value);
            onSave({ ...layline, name, type, color: e.target.value, notes });
          }}
          className="bg-[#2a2a3e] border border-[#5a3a28] rounded h-6 w-full"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => onSave({ ...layline, name, type, color, notes })}
          placeholder="Notes"
          className="bg-[#2a2a3e] border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-0.5 focus:outline-none focus:border-[#c4a35a]"
        />
      </div>
      <div className="text-[10px] text-[#f5e6c8]/40 truncate">{layline.hexes.join(' → ')}</div>
    </div>
  );
}
