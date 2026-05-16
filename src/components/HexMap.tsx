'use client';

import React, {
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { ALL_HEXES, HEX_CELLS } from '@/lib/hex-grid';
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
  const baseBounds = useMemo(() => gridBounds(), []);

  const [view, setView] = useState({ x: baseBounds.x, y: baseBounds.y, w: baseBounds.w, h: baseBounds.h });
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null);
  const [hoverScreen, setHoverScreen] = useState<{ x: number; y: number } | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [selectedLayline, setSelectedLayline] = useState<string | null>(null);
  const [pendingForm, setPendingForm] = useState<
    | { type: 'poi'; hex: HexCoord }
    | { type: 'door'; hex: HexCoord }
    | null
  >(null);

  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null);
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
          const { draftLayline: _omit, ...rest } = md;
          void _omit;
          return rest;
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
      const rect = svg.getBoundingClientRect();
      const xFrac = (clientX - rect.left) / rect.width;
      const yFrac = (clientY - rect.top) / rect.height;
      return { x: view.x + xFrac * view.w, y: view.y + yFrac * view.h };
    },
    [view],
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (panRef.current) {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const dx = ((e.clientX - panRef.current.startX) / rect.width) * view.w;
        const dy = ((e.clientY - panRef.current.startY) / rect.height) * view.h;
        setView((v) => ({ ...v, x: panRef.current!.viewX - dx, y: panRef.current!.viewY - dy }));
        return;
      }
      const img = screenToImage(e.clientX, e.clientY);
      if (!img) return;
      const hex = pixelToHex(img.x, img.y);
      setHoverHex(hex);
      setHoverScreen(hex ? { x: e.clientX, y: e.clientY } : null);
    },
    [screenToImage, view.w, view.h],
  );

  const handleMouseDown = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => {
      if (e.button !== 0) return;
      // Shift+drag pans the view. Plain clicks fall through to the polygon's
      // own onClick so the user can select a hex. Note that shift+click
      // *without movement* still triggers the polygon click (no drag, no
      // separate gesture) — that's accepted as inert overlap rather than
      // adding a movement-threshold heuristic.
      if (e.shiftKey) {
        panRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
        e.preventDefault();
      }
    },
    [view.x, view.y],
  );

  const handleMouseUp = useCallback(() => {
    panRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    panRef.current = null;
    setHoverHex(null);
    setHoverScreen(null);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      const yFrac = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const newW = Math.max(baseBounds.w * 0.05, Math.min(baseBounds.w * 1.5, v.w * factor));
        const newH = Math.max(baseBounds.h * 0.05, Math.min(baseBounds.h * 1.5, v.h * factor));
        const cursorX = v.x + xFrac * v.w;
        const cursorY = v.y + yFrac * v.h;
        return { x: cursorX - xFrac * newW, y: cursorY - yFrac * newH, w: newW, h: newH };
      });
    },
    [baseBounds.w, baseBounds.h],
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
      setSelectedHex(hex);
      setSelectedLayline(null);
      setPendingForm(null);
    },
    [drawingLayline, setDraftLayline],
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
      const { draftLayline: _omit, ...rest } = md;
      void _omit;
      // Clear the draft either way. If there's enough to commit, also
      // append the layline. (Below-2-hex finish behaves like a cancel.)
      if (!fresh || fresh.hexes.length < 2) return rest;
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
          onClick={(e) => {
            e.stopPropagation();
            handleHexClick(coord);
          }}
          style={{ cursor: drawingLayline ? 'crosshair' : 'pointer' }}
        />
        {isInDraft && (
          <text
            x={center.x}
            y={center.y + 16}
            textAnchor="middle"
            fontSize="50"
            fill="#1a1a2e"
            fontWeight="bold"
            pointerEvents="none"
          >
            {drawingLayline!.hexes.indexOf(coord) + 1}
          </text>
        )}
        {view.w < baseBounds.w * 0.5 && (
          <text
            x={center.x}
            y={center.y - 90}
            textAnchor="middle"
            fontSize="30"
            fill="#f5e6c8"
            opacity={0.6}
            pointerEvents="none"
          >
            {coord}
          </text>
        )}
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
      lines.push(
        <polyline
          key={ll.id}
          points={polylinePoints(ll.hexes)}
          fill="none"
          stroke={ll.color}
          strokeWidth={14}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={selectedLayline && selectedLayline !== ll.id ? 0.35 : 0.9}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLayline(ll.id);
            setSelectedHex(null);
          }}
        />,
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
        if (entry.kind === 'poi') {
          els.push(
            <circle
              key={`poi-${entry.item.id}`}
              cx={mx}
              cy={my}
              r={22}
              fill="#8b2500"
              stroke="#f5e6c8"
              strokeWidth={4}
              pointerEvents="none"
            />,
          );
        } else {
          els.push(
            <g key={`door-${entry.item.id}`} pointerEvents="none">
              <circle cx={mx} cy={my} r={26} fill="#a774d6" stroke="#f5e6c8" strokeWidth={4} />
              <text x={mx} y={my + 12} textAnchor="middle" fontSize="38" fill="#1a1a2e" fontWeight="bold">
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
    setSelectedHex(null);
    setSelectedLayline(null);
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
          <span className="text-[#f5e6c8]/40 text-xs ml-auto">
            Scroll to zoom · Shift-drag to pan · Click a hex to inspect
          </span>
        </div>
        {drawingLayline && <LaylineDraftForm draft={drawingLayline} setDraft={setDraftLayline} />}
      </div>

      <div className="bg-[#1a1a2e] rounded-lg overflow-hidden relative" style={{ height: '60vh' }}>
        <svg
          ref={svgRef}
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full select-none"
          style={{ cursor: panRef.current ? 'grabbing' : drawingLayline ? 'crosshair' : 'default' }}
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

        {hoverHex && hoverScreen && !drawingLayline && (
          <HoverChip
            hex={hoverHex}
            screen={hoverScreen}
            terrain={HEX_CELLS[hoverHex].terrain}
            isCurrent={character.currentLocationHex === hoverHex}
            hasContent={contentsByHex.has(hoverHex)}
            onSetCurrent={() => setCurrentLocation(hoverHex)}
            onAddPOI={() => {
              setSelectedHex(hoverHex);
              setPendingForm({ type: 'poi', hex: hoverHex });
            }}
            onAddDoor={() => {
              setSelectedHex(hoverHex);
              setPendingForm({ type: 'door', hex: hoverHex });
            }}
            onInspect={() => {
              setSelectedHex(hoverHex);
              setPendingForm(null);
            }}
          />
        )}
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
          onClose={() => {
            setSelectedHex(null);
            setPendingForm(null);
          }}
        />
        <LaylinesPanel
          mapData={mapData}
          updateMap={updateMap}
          selectedLayline={selectedLayline}
          setSelectedLayline={setSelectedLayline}
        />
      </div>
    </div>
  );
}

// --- Hover chip ---
function HoverChip({
  hex,
  screen,
  terrain,
  isCurrent,
  hasContent,
  onSetCurrent,
  onAddPOI,
  onAddDoor,
  onInspect,
}: {
  hex: HexCoord;
  screen: { x: number; y: number };
  terrain: string;
  isCurrent: boolean;
  hasContent: boolean;
  onSetCurrent: () => void;
  onAddPOI: () => void;
  onAddDoor: () => void;
  onInspect: () => void;
}) {
  // Wrapper is pointer-events-none so the cursor passes through to the
  // SVG beneath — otherwise the chip blocks the mousemove/mouseleave that
  // tracks hex hover, and the chip gets stuck anchored at the last position.
  // Individual buttons re-enable pointer events so they remain clickable.
  //
  // Measure the rendered chip and flip its anchor when the default
  // bottom-right position would clip outside the viewport.
  const chipRef = useRef<HTMLDivElement>(null);
  const [chipSize, setChipSize] = useState({ w: 180, h: 160 });
  useLayoutEffect(() => {
    if (!chipRef.current) return;
    const rect = chipRef.current.getBoundingClientRect();
    if (rect.width && rect.height && (rect.width !== chipSize.w || rect.height !== chipSize.h)) {
      setChipSize({ w: rect.width, h: rect.height });
    }
  });
  const vw = typeof window === 'undefined' ? Infinity : window.innerWidth;
  const vh = typeof window === 'undefined' ? Infinity : window.innerHeight;
  const flipX = screen.x + 14 + chipSize.w > vw;
  const flipY = screen.y + 14 + chipSize.h > vh;
  const left = flipX ? Math.max(4, screen.x - 14 - chipSize.w) : screen.x + 14;
  const top = flipY ? Math.max(4, screen.y - 14 - chipSize.h) : screen.y + 14;

  return (
    <div
      ref={chipRef}
      className="fixed z-50 pointer-events-none bg-[#1a1a2e]/95 border border-[#c4a35a]/50 rounded-md shadow-lg p-2 text-xs text-[#f5e6c8]"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2 mb-1 pb-1 border-b border-[#5a3a28]">
        <span className="text-[#c4a35a] font-bold">{hex}</span>
        <span className="text-[#f5e6c8]/60">{terrain}</span>
        {isCurrent && <span className="text-[#c4a35a]">★ here</span>}
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={onSetCurrent}
          disabled={isCurrent}
          className="pointer-events-auto text-left px-2 py-1 rounded hover:bg-[#2d4a2e] disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
        >
          📍 Set as current
        </button>
        <button onClick={onAddPOI} className="pointer-events-auto text-left px-2 py-1 rounded hover:bg-[#2d4a2e] transition-colors">
          + POI
        </button>
        <button onClick={onAddDoor} className="pointer-events-auto text-left px-2 py-1 rounded hover:bg-[#2d4a2e] transition-colors">
          ✦ Faye Door
        </button>
        {hasContent && (
          <button onClick={onInspect} className="pointer-events-auto text-left px-2 py-1 rounded hover:bg-[#2d4a2e] transition-colors">
            🔍 Inspect
          </button>
        )}
      </div>
    </div>
  );
}

// --- Layline draft form ---
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
  onClose: () => void;
}) {
  if (!selectedHex) {
    return (
      <div className="bg-[#2a2a3e] rounded-lg p-4 text-sm text-[#f5e6c8]/50 italic">
        Hover a hex for quick actions, or click one to inspect.
      </div>
    );
  }
  // Reuse the parent's already-bucketed lookup instead of re-filtering here.
  const bucket = contentsByHex.get(selectedHex);
  const pois = bucket?.pois ?? [];
  const doors = bucket?.doors ?? [];
  const cell = HEX_CELLS[selectedHex];

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-[#5a3a28] pb-2">
        <div>
          <span className="text-[#c4a35a] font-bold">Hex {selectedHex}</span>
          <span className="text-[#f5e6c8]/60 text-xs ml-2">{cell?.terrain}</span>
          {currentLocationHex === selectedHex && <span className="text-[#c4a35a] text-xs ml-2">★ current</span>}
        </div>
        <div className="flex gap-2 text-xs">
          {currentLocationHex !== selectedHex && (
            <button
              onClick={() => setCurrentLocation(selectedHex)}
              className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-2 py-1 transition-colors"
            >
              📍 Set current
            </button>
          )}
          <button onClick={onClose} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
            ✕
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[#c4a35a] text-sm font-semibold">Points of Interest</h4>
          <button
            onClick={() => setPendingForm({ type: 'poi', hex: selectedHex })}
            className="text-xs bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-0.5 transition-colors"
          >
            + Add POI
          </button>
        </div>
        {pendingForm?.type === 'poi' && pendingForm.hex === selectedHex && (
          <POIForm
            hex={selectedHex}
            onSubmit={(poi) => {
              updateMap((md) => ({ ...md, pois: [...md.pois, poi] }));
              setPendingForm(null);
            }}
            onCancel={() => setPendingForm(null)}
          />
        )}
        {pois.length === 0 ? (
          <div className="text-xs text-[#f5e6c8]/40 italic">None.</div>
        ) : (
          <div className="space-y-2">
            {pois.map((p) => (
              <POIEditor
                key={p.id}
                poi={p}
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
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-[#c4a35a] text-sm font-semibold">Faye Doors</h4>
          <button
            onClick={() => setPendingForm({ type: 'door', hex: selectedHex })}
            className="text-xs bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-0.5 transition-colors"
          >
            + Add Door
          </button>
        </div>
        {pendingForm?.type === 'door' && pendingForm.hex === selectedHex && (
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
        {doors.length === 0 ? (
          <div className="text-xs text-[#f5e6c8]/40 italic">None.</div>
        ) : (
          <div className="space-y-2">
            {doors.map((d) => (
              <DoorEditor
                key={d.id}
                door={d}
                allDoors={mapData.fayeDoors}
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
        )}
      </div>
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
  onSave,
  onDelete,
}: {
  poi: MapPOI;
  onSave: (p: MapPOI) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(poi.name);
  const [notes, setNotes] = useState(poi.notes);
  const [expanded, setExpanded] = useState(false);
  const dirty = name !== poi.name || notes !== poi.notes;
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
        <button onClick={onDelete} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
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
  onSave,
  onDelete,
}: {
  door: FayeDoor;
  allDoors: FayeDoor[];
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
  const [expanded, setExpanded] = useState(false);

  const partner = (() => {
    if (door.destination.kind !== 'roaded') return null;
    const paired = door.destination.pairedDoorId;
    return allDoors.find((d) => d.id === paired) ?? null;
  })();
  const pairable = pairableDoors(allDoors, door.id);

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
        <button onClick={onDelete} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
          Del
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 pt-1">
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
  setSelectedLayline,
}: {
  mapData: CharacterMapData;
  updateMap: (fn: (md: CharacterMapData) => CharacterMapData) => void;
  selectedLayline: string | null;
  setSelectedLayline: (id: string | null) => void;
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
              onSelect={() => setSelectedLayline(selectedLayline === ll.id ? null : ll.id)}
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
  return (
    <div className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${selected ? 'ring-1 ring-[#c4a35a]/60' : ''}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={onSelect}
          aria-label="highlight on map"
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
        <button onClick={onDelete} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
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
          onChange={(e) => setColor(e.target.value)}
          onBlur={() => onSave({ ...layline, name, type, color, notes })}
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
