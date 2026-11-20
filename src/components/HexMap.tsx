'use client';

import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  Character,
  CharacterMapData,
  CharacterUpdater,
  FairyDoor,
  FairyDoorDestination,
  HexCoord,
  LeyLine,
  LeyLineDraft,
  MapPOI,
} from '@/lib/types';
import { ALL_HEXES, HEX_CELLS, HEX_GRID_META } from '@/lib/hex-grid';
import { gridBounds, hexCenterOf, hexPath, hexVertices, isValidHex, pixelToHex } from '@/lib/hex';
import {
  DEFAULT_LEY_LINE_TYPE,
  LEY_LINE_COLORS,
  deleteFairyDoor,
  pairableDoors,
  upsertFairyDoor,
  withMapLists,
} from '@/lib/map-data';

interface HexMapProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
}

// --- Colours ---
const TERRAIN_FILL = { woods: '#2d4a2e', open: '#4a3a26' } as const;
const GRID_STROKE = '#5a3a28';
const GOLD = '#c4a35a';
const PARCHMENT = '#f5e6c8';
const NIGHT = '#1a1a2e';
const POI_FILL = '#8b2500';
const DOOR_FILL = '#a774d6';

// --- Sizes in image units (the printed map's pixels); they scale with zoom ---
const HEX_SIZE = HEX_GRID_META.hexSize;
const MARKER_RING_RADIUS = 42; // markers sharing a hex fan out on this circle
const POI_RADIUS = 22;
const DOOR_RADIUS = 26;
const BADGE_RADIUS = 24;
const STAR_RADIUS = 42;
// On the current hex the star takes the middle, so markers circle it, this
// far outside the star.
const CURRENT_RING_GAP = DOOR_RADIUS + 4;
const MAX_VISIBLE_MARKERS = 4; // more than this collapse into a "+N" badge
const LEY_LINE_WIDTH = 14;
const CONNECTOR_WIDTH = 8;
const COORD_LABEL_FONT = 30;
const COORD_LABEL_OFFSET = HEX_SIZE * 0.55; // label sits this far above the centre
const DRAFT_STEP_FONT = 50;
const ROAD_LABEL_FONT = 34;
const DOOR_GLYPH_FONT = 38; // the ✦ on a fairy door marker
const BADGE_FONT = 28; // the "+N" overflow badge
const STAR_GLYPH_FONT = 56; // the ★ of the current location
const MARKER_RIM = 4; // pale rim around markers
const BADGE_RIM = 3;
const STAR_RIM = 6;
const TEXT_HALO = 8; // dark outline that keeps draft step numbers legible
const ROAD_LABEL_HALO = 6;

// --- Line widths in CSS pixels (non-scaling), so outlines stay visible at any zoom ---
const GRID_LINE_PX = 1;
const HIGHLIGHT_LINE_PX = 2.5;
const CURRENT_LINE_PX = 3;

// --- Smallest on-screen sizes, in CSS pixels ---
// Zoomed out, the image sizes above get too small to see (a hex is about
// 20 px across at the whole-map view on a phone), so overlays grow to stay
// at least this big. Labels that would be smaller are hidden instead.
const MIN_MARKER_PX = 12; // POI diameter; doors, badges and rings grow with it
const MIN_STAR_PX = 14; // current-location star diameter
const MIN_LEY_LINE_PX = 2.5;
const MIN_ROAD_LINE_PX = 1.5;
const MIN_STEP_FONT_PX = 10; // step numbers of a ley line being drawn
const MIN_LABEL_FONT_PX = 8; // hex coordinates and fairy road names
const COORD_LABEL_OPACITY = 0.7;

// --- Navigation ---
const PAN_THRESHOLD_PX = 4; // movement before a press becomes a pan, so taps still select
const MIN_VIEW_FRACTION = 0.05; // most zoomed in: 5% of the map's width
const MAX_VIEW_FRACTION = 1.5; // most zoomed out
const WHEEL_ZOOM_PER_PX = 0.0015; // a 100 px mouse-wheel notch zooms ~16%
const WHEEL_DELTA_CAP_PX = 100; // per event, so one large jump can't zoom far
const WHEEL_LINE_PX = 16; // wheel deltaMode 1 (lines) → pixels
const BUTTON_ZOOM_FACTOR = 1.25;
const ARROW_PAN_FRACTION = 0.1; // arrow keys pan by this much of the view
// Screens where the hex inspector, below the map, is usually off-screen
// when a hex is picked: narrow ones, and short ones such as a wide phone in
// landscape. There, picking a hex scrolls its details into view.
const REVEAL_INSPECTOR_QUERY = '(max-width: 767px), (max-height: 500px)';

// Inputs are 16 px on phones so iOS doesn't zoom the page when they get focus.
const INPUT_BASE =
  'border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-base md:text-sm focus:outline-none focus:border-[#c4a35a]';
const INPUT_ON_CARD = `bg-[#1a1a2e] ${INPUT_BASE}`; // on a #2a2a3e card
const INPUT_ON_ITEM = `bg-[#2a2a3e] ${INPUT_BASE}`; // inside a #1a1a2e item box

type View = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

// Polygon points and outline paths, computed once for every hex.
const HEX_POINTS: ReadonlyMap<HexCoord, string> = new Map(
  ALL_HEXES.map((h) => [
    h,
    hexVertices(HEX_CELLS[h].col, HEX_CELLS[h].row).map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' '),
  ]),
);
const HEX_PATHS: ReadonlyMap<HexCoord, string> = new Map(
  ALL_HEXES.map((h) => [h, hexPath(HEX_CELLS[h].col, HEX_CELLS[h].row)]),
);

// How much of an item's notes its marker's label and tooltip show.
const NOTES_PREVIEW_LENGTH = 120;

/** " — " and the start of `notes`, for a marker's label; '' if there are none. */
function notesPreview(notes: string): string {
  return notes ? ` — ${notes.slice(0, NOTES_PREVIEW_LENGTH)}` : '';
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}`;
}

// Markers and ley lines are buttons for keyboard and screen-reader users.
// Their clicks and Enter/Space presses are handled once, on the SVG, by
// reading their data-* attributes (see activateMapItem).
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-[#c4a35a] focus-visible:outline-offset-2';
const MAP_BUTTON_PROPS = {
  role: 'button',
  tabIndex: 0,
  style: { cursor: 'pointer' },
  className: FOCUS_RING,
} as const;

/** Image point shown at client point (cx, cy) for view `v` in an SVG with box `rect` (preserveAspectRatio meet). */
function clientToImage(v: View, rect: DOMRect, cx: number, cy: number): Point {
  const s = Math.min(rect.width / v.w, rect.height / v.h);
  return {
    x: v.x + (cx - rect.left - (rect.width - v.w * s) / 2) / s,
    y: v.y + (cy - rect.top - (rect.height - v.h * s) / 2) / s,
  };
}

/**
 * `v` scaled by `factor` (> 1 zooms out) about image point `anchor`, which
 * stays at the same place on screen. Width and height share one clamped
 * factor, so the view's aspect ratio never drifts.
 */
function zoomView(v: View, factor: number, anchor: Point, base: View): View {
  const minF = Math.max((base.w * MIN_VIEW_FRACTION) / v.w, (base.h * MIN_VIEW_FRACTION) / v.h);
  const maxF = Math.min((base.w * MAX_VIEW_FRACTION) / v.w, (base.h * MAX_VIEW_FRACTION) / v.h);
  const f = Math.min(maxF, Math.max(minF, factor));
  return { x: anchor.x - (anchor.x - v.x) * f, y: anchor.y - (anchor.y - v.y) * f, w: v.w * f, h: v.h * f };
}

// Pointer capture throws if the pointer is no longer active (e.g. a touch
// the browser already cancelled); a lost capture only costs the pan.
function capturePointer(el: Element | null, id: number) {
  try {
    if (el && !el.hasPointerCapture(id)) el.setPointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}
function releasePointer(el: Element | null, id: number) {
  try {
    if (el?.hasPointerCapture(id)) el.releasePointerCapture(id);
  } catch {
    /* pointer already gone */
  }
}

const viewCenter = (v: View): Point => ({ x: v.x + v.w / 2, y: v.y + v.h / 2 });
const inView = (v: View, p: Point) => p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;

const HEX_CENTER_POINTS: readonly Point[] = ALL_HEXES.map((h) => hexCenterOf(h)!);

/**
 * `v`, moved if needed so that its centre stays over the map: no further than
 * a hex's size from the nearest hex centre. However far a pan, pinch, scroll
 * or arrow key goes, the middle of the box still shows a hex.
 */
function keepOnMap(v: View): View {
  const c = viewCenter(v);
  let nearest = HEX_CENTER_POINTS[0];
  let nearestDist2 = Infinity;
  for (const h of HEX_CENTER_POINTS) {
    const d2 = (h.x - c.x) ** 2 + (h.y - c.y) ** 2;
    if (d2 < nearestDist2) {
      nearestDist2 = d2;
      nearest = h;
    }
  }
  const dist = Math.sqrt(nearestDist2);
  if (dist <= HEX_SIZE) return v;
  const k = HEX_SIZE / dist;
  return { ...v, x: nearest.x + (c.x - nearest.x) * k - v.w / 2, y: nearest.y + (c.y - nearest.y) * k - v.h / 2 };
}

// --- Static layers: drawn once, never re-rendered by hovering or panning ---

const HexCell = memo(function HexCell({ coord, isCurrent }: { coord: HexCoord; isCurrent: boolean }) {
  const { terrain } = HEX_CELLS[coord];
  return (
    <polygon
      data-hex={coord}
      points={HEX_POINTS.get(coord)}
      fill={TERRAIN_FILL[terrain]}
      stroke={GRID_STROKE}
      strokeWidth={GRID_LINE_PX}
      vectorEffect="non-scaling-stroke"
      // role="img" + aria-label announces the hex but keeps all 200 hexes out
      // of the Tab order; markers and lines are the tabbable items, and
      // "Go to hex" reaches any hex from the keyboard.
      role="img"
      aria-label={`Hex ${coord}${isCurrent ? ', current location' : ''}, terrain ${terrain}`}
    />
  );
});

const HexGridLayer = memo(function HexGridLayer({ currentHex }: { currentHex: HexCoord | '' }) {
  return ALL_HEXES.map((h) => <HexCell key={h} coord={h} isCurrent={h === currentHex} />);
});

const CoordLabels = memo(function CoordLabels() {
  return ALL_HEXES.map((h) => {
    const c = hexCenterOf(h)!;
    return (
      <text key={h} x={c.x} y={c.y - COORD_LABEL_OFFSET} textAnchor="middle" fontSize={COORD_LABEL_FONT} fill={PARCHMENT}>
        {h}
      </text>
    );
  });
});

/**
 * Open/closed state of an inspector editor. Starts open if the hex holds only
 * this item or its marker was just clicked; opens again whenever the hex comes
 * down to this one item or the marker is clicked (each click gives a new
 * `focusSeq`). It never closes by itself. Reacts to the props by keeping their
 * previous values in state instead of using an effect:
 * https://react.dev/reference/react/useState#storing-information-from-previous-renders
 */
function useExpanded(singleton: boolean, focusSeq: number | undefined) {
  const [expanded, setExpanded] = useState(singleton || focusSeq !== undefined);
  const [prev, setPrev] = useState({ singleton, focusSeq });
  if (prev.singleton !== singleton || prev.focusSeq !== focusSeq) {
    setPrev({ singleton, focusSeq });
    if ((singleton && !prev.singleton) || (focusSeq !== undefined && focusSeq !== prev.focusSeq)) setExpanded(true);
  }
  return [expanded, setExpanded] as const;
}

/**
 * A request, from a marker, to show its item's editor. `seq` is new for each
 * request. `target` is what gets focus: the name field, or for a tap, the
 * editor itself, so that a phone doesn't raise its keyboard.
 */
type FocusRequest = { seq: number; target: 'name' | 'item' };

/** On each focus request, bring the editor into view and focus its target. */
function useFocusOnRequest(
  request: FocusRequest | undefined,
  rootRef: React.RefObject<HTMLElement | null>,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  const seq = request?.seq;
  const target = request?.target;
  useEffect(() => {
    if (seq === undefined) return;
    rootRef.current?.scrollIntoView({ block: 'nearest' });
    (target === 'item' ? rootRef.current : inputRef.current)?.focus({ preventScroll: true });
  }, [seq, target, rootRef, inputRef]);
}

export default function HexMap({ character, onChange }: HexMapProps) {
  // Migration + sanitizer guarantee a well-formed mapData, but stay defensive.
  const mapData = withMapLists(character.mapData);
  const pois = mapData.pois;
  const doors = mapData.fairyDoors;
  const leyLines = mapData.leyLines;
  const draft = mapData.draftLeyLine ?? null;
  const currentHex = character.currentLocationHex ?? '';
  const baseBounds = gridBounds();

  const [view, setView] = useState<View>({ x: baseBounds.x, y: baseBounds.y, w: baseBounds.w, h: baseBounds.h });
  const [hoverHex, setHoverHex] = useState<HexCoord | null>(null);
  const [selectedHex, setSelectedHex] = useState<HexCoord | null>(null);
  const [selectedLeyLine, setSelectedLeyLine] = useState<string | null>(null);
  // Set by a marker click: the inspector opens, scrolls to and focuses that
  // item's editor. `seq` changes on every click, even of the same marker.
  const [focus, setFocus] = useState<({ id: string } & FocusRequest) | null>(null);
  const [pendingForm, setPendingForm] = useState<{ type: 'poi' | 'door'; hex: HexCoord } | null>(null);
  // Bumped when a hex is picked; on phones (REVEAL_INSPECTOR_QUERY) the
  // inspector, below the map, is then scrolled into view.
  const [revealSeq, setRevealSeq] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inspectorRef = useRef<HTMLDivElement>(null);
  // The map box's size in CSS px, for the smallest on-screen sizes below.
  const [boxSize, setBoxSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      setBoxSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Drop selections whose item no longer exists (deleted, or gone in a
  // re-import). Adjusted during render rather than in an effect; each guard
  // settles after one extra pass.
  if (focus && !pois.some((p) => p.id === focus.id) && !doors.some((d) => d.id === focus.id)) {
    setFocus(null);
  }
  if (selectedLeyLine !== null && !leyLines.some((l) => l.id === selectedLeyLine)) {
    setSelectedLeyLine(null);
  }

  useEffect(() => {
    if (revealSeq > 0 && window.matchMedia(REVEAL_INSPECTOR_QUERY).matches) {
      inspectorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [revealSeq]);

  // An action that removes the focused control (closing the inspector,
  // adding or deleting an item, starting or ending a ley line) names, by its
  // data-focus-key, where focus goes once the change is on screen, so that
  // focus doesn't fall back to the page.
  const [focusAfter, setFocusAfter] = useState<{ key: string; seq: number } | null>(null);
  const moveFocusTo = (key: string) => setFocusAfter((f) => ({ key, seq: (f?.seq ?? 0) + 1 }));
  useEffect(() => {
    if (!focusAfter) return;
    const el = rootRef.current?.querySelector<HTMLElement | SVGElement>(`[data-focus-key="${CSS.escape(focusAfter.key)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusAfter]);

  // Every change to "what's selected" goes through these, so the selected
  // hex, selected ley line, focused item and open form stay consistent.
  const selectHex = (hex: HexCoord, focusId?: string, focusTarget: FocusRequest['target'] = 'name') => {
    setSelectedHex(hex);
    setSelectedLeyLine(null);
    setPendingForm(null);
    if (focusId) {
      setFocus((f) => ({ id: focusId, seq: (f?.seq ?? 0) + 1, target: focusTarget }));
    } else {
      setFocus(null);
      setRevealSeq((n) => n + 1);
    }
  };
  const selectLeyLine = (id: string) => {
    setSelectedLeyLine(id);
    setSelectedHex(null);
    setFocus(null);
    setPendingForm(null);
  };
  const clearSelection = () => {
    setSelectedHex(null);
    setSelectedLeyLine(null);
    setFocus(null);
    setPendingForm(null);
  };

  // Map writes go through the functional form of onChange so that several
  // writes in one event tick compose (each reads the result of the last).
  const updateMap = useCallback(
    (updater: (md: CharacterMapData) => CharacterMapData) => {
      onChange((prev) => ({ mapData: updater(withMapLists(prev.mapData)) }));
    },
    [onChange],
  );

  const setDraftLeyLine = useCallback(
    (next: LeyLineDraft | null | ((prev: LeyLineDraft | null) => LeyLineDraft | null)) => {
      updateMap((md) => {
        const resolved = typeof next === 'function' ? next(md.draftLeyLine ?? null) : next;
        if (resolved === null) {
          if (md.draftLeyLine === undefined) return md;
          // Drop the key so the saved JSON doesn't carry a stale draft.
          const { draftLeyLine: _drop, ...rest } = md;
          return rest;
        }
        return { ...md, draftLeyLine: resolved };
      });
    },
    [updateMap],
  );

  // Sets only the map's current hex (the star). The Adventuring tab's
  // free-text location is the player's own wording and is left alone.
  const setCurrentLocation = useCallback(
    (hex: HexCoord) => {
      if (!isValidHex(hex)) return;
      onChange({ currentLocationHex: hex });
    },
    [onChange],
  );

  const recenterOnHex = (hex: HexCoord) => {
    const c = hexCenterOf(hex);
    if (!c) return;
    setView((v) => ({ ...v, x: c.x - v.w / 2, y: c.y - v.h / 2 }));
  };

  const handleHexClick = (hex: HexCoord) => {
    if (draft) {
      setDraftLeyLine((d) => {
        if (!d) return d;
        // The last hex again: undo it.
        if (d.hexes[d.hexes.length - 1] === hex) return { ...d, hexes: d.hexes.slice(0, -1) };
        // An earlier hex of the draft: cut the line back to it.
        const idx = d.hexes.indexOf(hex);
        if (idx >= 0) return { ...d, hexes: d.hexes.slice(0, idx + 1) };
        return { ...d, hexes: [...d.hexes, hex] };
      });
      return;
    }
    selectHex(hex);
  };

  // --- Pan, pinch and hover (Pointer Events: mouse, pen and touch) ---
  // A press becomes a pan once it moves PAN_THRESHOLD_PX, so taps and clicks
  // still select. The pointer is captured only then, so a plain click still
  // reaches the hex or marker under it. Two fingers pinch-zoom around their
  // midpoint. Gesture values are copied into locals before any state update
  // is queued; no ref is read inside a state updater.
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<
    | { kind: 'pan'; start: Point; view: View; scale: number; moved: boolean }
    | { kind: 'pinch'; startDist: number; startMid: Point; anchor: Point; view: View; rect: DOMRect }
    | null
  >(null);
  // Set when a mouse or pen pan or pinch ends, so the click the browser fires
  // right after it doesn't select anything. It's cleared once that event is
  // over: a touch drag fires no click, and a flag left set would swallow the
  // next click that comes without a press (from assistive technology).
  const suppressClickRef = useRef(false);
  // The pointer type of the last press, for clicks that don't report one.
  const lastPointerTypeRef = useRef('');

  const startPan = (start: Point, v: View, moved = false) => {
    const rect = svgRef.current!.getBoundingClientRect();
    gestureRef.current = {
      kind: 'pan',
      start,
      view: v,
      scale: 1 / Math.min(rect.width / v.w, rect.height / v.h), // image units per CSS px
      moved,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    lastPointerTypeRef.current = e.pointerType;
    // A new interaction: forget a suppression left by an earlier drag.
    suppressClickRef.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointersRef.current.values()];
    if (pts.length === 1) {
      startPan(pts[0], view);
    } else if (pts.length === 2) {
      const rect = svgRef.current!.getBoundingClientRect();
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      gestureRef.current = {
        kind: 'pinch',
        startDist: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        startMid: mid,
        anchor: clientToImage(view, rect, mid.x, mid.y),
        view,
        rect,
      };
      for (const id of pointersRef.current.keys()) {
        capturePointer(svgRef.current, id);
      }
      setIsPanning(true);
    }
  };

  // `id` no longer takes part in the gesture: it was lifted, or its press
  // was dropped before it became a pan.
  const removePointer = (id: number) => {
    pointersRef.current.delete(id);
    releasePointer(svgRef.current, id);
    const rest = [...pointersRef.current.values()];
    if (rest.length === 1 && gestureRef.current?.kind === 'pinch') {
      // One finger left after a pinch: carry on panning from where it is.
      startPan(rest[0], view, true);
    } else if (rest.length === 0) {
      gestureRef.current = null;
      setIsPanning(false);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // A mouse press released outside the map before it became a pan was
    // never captured, so its pointerup went elsewhere. With no button held
    // it's over: drop it, and treat this move as a hover.
    if (e.pointerType === 'mouse' && (e.buttons & 1) === 0 && pointersRef.current.has(e.pointerId)) {
      removePointer(e.pointerId);
    }
    const g = gestureRef.current;
    if (!pointersRef.current.has(e.pointerId) || !g) {
      if (e.pointerType === 'mouse') {
        const rect = svgRef.current!.getBoundingClientRect();
        const p = clientToImage(view, rect, e.clientX, e.clientY);
        setHoverHex(pixelToHex(p.x, p.y));
      }
      return;
    }
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.kind === 'pan') {
      const dx = e.clientX - g.start.x;
      const dy = e.clientY - g.start.y;
      if (!g.moved) {
        if (Math.hypot(dx, dy) <= PAN_THRESHOLD_PX) return;
        g.moved = true;
        capturePointer(svgRef.current, e.pointerId);
        setIsPanning(true);
      }
      const { view: v0, scale } = g;
      setView(keepOnMap({ ...v0, x: v0.x - dx * scale, y: v0.y - dy * scale }));
      return;
    }
    // Pinch: zoom about the image point first under the fingers, keep it
    // under their midpoint as they move.
    const pts = [...pointersRef.current.values()];
    if (pts.length < 2) return;
    const dist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const zoomed = zoomView(g.view, g.startDist / dist, g.anchor, baseBounds);
    const s = Math.min(g.rect.width / zoomed.w, g.rect.height / zoomed.h);
    setView(keepOnMap({ ...zoomed, x: zoomed.x - (mid.x - g.startMid.x) / s, y: zoomed.y - (mid.y - g.startMid.y) / s }));
  };

  const handlePointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const g = gestureRef.current;
    if (g !== null && (g.kind === 'pinch' || g.moved) && e.pointerType !== 'touch') {
      suppressClickRef.current = true;
      // The click, if any, is dispatched with the pointerup, before this runs.
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    removePointer(e.pointerId);
  };

  // A press that leaves the map before it becomes a pan isn't captured, so
  // its release may never come here: drop it now.
  const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gestureRef.current;
    if (g?.kind === 'pan' && !g.moved && pointersRef.current.has(e.pointerId)) removePointer(e.pointerId);
    if (e.pointerType === 'mouse' && !gestureRef.current) setHoverHex(null);
  };

  // Wheel / trackpad zoom about the cursor, scaled by how far the wheel
  // moved. Horizontal-only scrolls (deltaY 0) are left to the page. Attached
  // natively because React's wheel listener is passive (can't preventDefault).
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const px = e.deltaY * (e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? rect.height : 1);
      const factor = Math.exp(Math.max(-WHEEL_DELTA_CAP_PX, Math.min(WHEEL_DELTA_CAP_PX, px)) * WHEEL_ZOOM_PER_PX);
      const { clientX, clientY } = e;
      setView((v) => {
        const p = clientToImage(v, rect, clientX, clientY);
        // Over the letterbox padding (outside the map): zoom about the centre.
        return keepOnMap(zoomView(v, factor, inView(v, p) ? p : viewCenter(v), baseBounds));
      });
    },
    [baseBounds],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const zoomBy = (factor: number) => setView((v) => keepOnMap(zoomView(v, factor, viewCenter(v), baseBounds)));
  const resetView = () => setView({ x: baseBounds.x, y: baseBounds.y, w: baseBounds.w, h: baseBounds.h });

  // One handler for everything clickable on the map, found from the click
  // target's data-* attributes: markers and ley lines (drawn on top), then
  // hexes. Markers add their hex to a ley line being drawn, otherwise they
  // open their hex with their own editor focused; ley lines toggle their
  // highlight; hexes are inspected (or added to the line being drawn).
  const activateMapItem = (target: Element, focusTarget: FocusRequest['target'] = 'name') => {
    const marker = target.closest('[data-marker]');
    if (marker) {
      const hex = marker.getAttribute('data-marker-hex')!;
      if (draft) handleHexClick(hex);
      else selectHex(hex, marker.getAttribute('data-marker')!, focusTarget);
      return;
    }
    const line = target.closest('[data-ley-line]')?.getAttribute('data-ley-line');
    if (line) {
      if (selectedLeyLine === line) clearSelection();
      else selectLeyLine(line);
      return;
    }
    const hex = target.closest('[data-hex]')?.getAttribute('data-hex');
    if (hex) handleHexClick(hex);
  };

  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // The click that ends a pan or pinch isn't a selection.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // A tap on a marker focuses its editor, not the name field, so that a
    // phone or tablet doesn't raise its keyboard. Current browsers make the
    // click a PointerEvent; for others, the last press's type stands in.
    const pointerType = (e.nativeEvent as Partial<PointerEvent>).pointerType ?? lastPointerTypeRef.current;
    activateMapItem(e.target as Element, pointerType === 'touch' || pointerType === 'pen' ? 'item' : 'name');
  };

  // Keyboard: Enter/Space activate the focused marker or line; when the map
  // itself has focus, arrow keys pan and + / - zoom.
  const handleMapKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target !== e.currentTarget) {
      e.preventDefault();
      activateMapItem(e.target as Element);
      return;
    }
    const pan = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (pan) {
      e.preventDefault();
      setView((v) => keepOnMap({
        ...v,
        x: v.x + pan[0] * v.w * ARROW_PAN_FRACTION,
        y: v.y + pan[1] * v.h * ARROW_PAN_FRACTION,
      }));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1 / BUTTON_ZOOM_FACTOR);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(BUTTON_ZOOM_FACTOR);
    }
  };

  const finishLeyLine = useCallback(() => {
    // Mint the id outside the updater: StrictMode runs updaters twice, and
    // both runs must produce the same line.
    const newLineId = newId();
    updateMap((md) => {
      // Read the draft from `md` (fresh state), not from this render, so a
      // keystroke that lands just before the click isn't lost.
      const fresh = md.draftLeyLine;
      if (!fresh) return md;
      const { draftLeyLine: _drop, ...rest } = md;
      // Fewer than 2 hexes: Finish acts like Cancel.
      if (fresh.hexes.length < 2) return rest;
      const newLine: LeyLine = {
        id: newLineId,
        type: fresh.type || DEFAULT_LEY_LINE_TYPE,
        name: fresh.name || 'Unnamed Ley Line',
        color: fresh.color,
        hexes: fresh.hexes,
        notes: fresh.notes,
      };
      return { ...rest, leyLines: [...md.leyLines, newLine] };
    });
  }, [updateMap]);

  const startLeyLine = () => {
    setDraftLeyLine({
      name: '',
      type: DEFAULT_LEY_LINE_TYPE,
      color: LEY_LINE_COLORS[leyLines.length % LEY_LINE_COLORS.length],
      notes: '',
      hexes: [],
    });
    clearSelection();
  };

  // Items on each hex, in order: POIs first, then doors.
  const itemsByHex = new Map<HexCoord, { pois: MapPOI[]; doors: FairyDoor[] }>();
  for (const p of pois) {
    const e = itemsByHex.get(p.hex) ?? { pois: [], doors: [] };
    e.pois.push(p);
    itemsByHex.set(p.hex, e);
  }
  for (const d of doors) {
    const e = itemsByHex.get(d.hex) ?? { pois: [], doors: [] };
    e.doors.push(d);
    itemsByHex.set(d.hex, e);
  }

  // On-screen sizes. In image units, an overlay shrinks with the view; these
  // keep each one at its smallest on-screen size (MIN_*_PX) or more. Until
  // the box has been measured, image sizes are used and labels are hidden.
  const pxPerUnit = boxSize ? Math.min(boxSize.w / view.w, boxSize.h / view.h) : null;
  const atLeast = (units: number, minPx: number) => (pxPerUnit ? Math.max(units, minPx / pxPerUnit) : units);
  const legible = (fontUnits: number) => pxPerUnit !== null && fontUnits * pxPerUnit >= MIN_LABEL_FONT_PX;
  const leyLine = atLeast(LEY_LINE_WIDTH, MIN_LEY_LINE_PX);
  const roadLine = atLeast(CONNECTOR_WIDTH, MIN_ROAD_LINE_PX);
  const size = {
    marker: atLeast(POI_RADIUS, MIN_MARKER_PX / 2) / POI_RADIUS, // scale for all marker geometry
    star: atLeast(STAR_RADIUS, MIN_STAR_PX / 2) / STAR_RADIUS,
    leyLine,
    leyLineScale: leyLine / LEY_LINE_WIDTH,
    roadLine,
    roadLineScale: roadLine / CONNECTOR_WIDTH,
    stepFont: atLeast(DRAFT_STEP_FONT, MIN_STEP_FONT_PX),
    coordLabels: legible(COORD_LABEL_FONT),
    roadLabels: legible(ROAD_LABEL_FONT),
  };

  const polylinePoints = (hexes: HexCoord[]) =>
    hexes
      .map((h) => hexCenterOf(h))
      .filter((c): c is Point => c !== null)
      .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');

  const renderLeyLines = () =>
    leyLines.map((ll) => {
      if (ll.hexes.length < 2) return null;
      const label = `${ll.type || DEFAULT_LEY_LINE_TYPE}: ${ll.name || 'Unnamed'}${notesPreview(ll.notes)}`;
      return (
        <g
          key={ll.id}
          {...MAP_BUTTON_PROPS}
          data-ley-line={ll.id}
          aria-label={label}
          aria-pressed={selectedLeyLine === ll.id}
          // While drawing, existing lines must not catch the clicks meant
          // for the hexes under them.
          pointerEvents={draft ? 'none' : undefined}
        >
          <title>{label}</title>
          <polyline
            points={polylinePoints(ll.hexes)}
            fill="none"
            stroke={ll.color}
            strokeWidth={size.leyLine}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={selectedLeyLine && selectedLeyLine !== ll.id ? 0.35 : 0.9}
          />
        </g>
      );
    });

  const renderDraft = () => {
    if (!draft) return null;
    return (
      <g pointerEvents="none" aria-hidden="true">
        {draft.hexes.map((h) => (
          <path key={`fill-${h}`} d={HEX_PATHS.get(h)} fill={PARCHMENT} fillOpacity={0.12} />
        ))}
        {draft.hexes.length >= 2 && (
          <polyline
            points={polylinePoints(draft.hexes)}
            fill="none"
            stroke={draft.color}
            strokeWidth={size.leyLine}
            strokeDasharray={`${20 * size.leyLineScale} ${12 * size.leyLineScale}`}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.85}
          />
        )}
        {draft.hexes.map((h, i) => {
          const c = hexCenterOf(h);
          if (!c) return null;
          return (
            <text
              key={`step-${h}`}
              x={c.x}
              y={c.y + size.stepFont * 0.35}
              textAnchor="middle"
              fontSize={size.stepFont}
              fontWeight="bold"
              fill={PARCHMENT}
              stroke={NIGHT}
              strokeWidth={(TEXT_HALO * size.stepFont) / DRAFT_STEP_FONT}
              paintOrder="stroke"
            >
              {i + 1}
            </text>
          );
        })}
      </g>
    );
  };

  const renderDoorConnectors = () => {
    const seen = new Set<string>();
    const out: React.ReactElement[] = [];
    for (const d of doors) {
      if (d.destination.kind !== 'roaded') continue;
      const otherId = d.destination.pairedDoorId;
      const pairKey = [d.id, otherId].sort().join('|');
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const other = doors.find((x) => x.id === otherId);
      const ca = hexCenterOf(d.hex);
      const cb = other ? hexCenterOf(other.hex) : null;
      if (!ca || !cb) continue;
      out.push(
        <g key={pairKey} pointerEvents="none">
          <line
            x1={ca.x}
            y1={ca.y}
            x2={cb.x}
            y2={cb.y}
            stroke={DOOR_FILL}
            strokeWidth={size.roadLine}
            strokeDasharray={`${20 * size.roadLineScale} ${14 * size.roadLineScale}`}
            opacity={0.75}
          />
          {d.destination.roadName && size.roadLabels && (
            <text
              x={(ca.x + cb.x) / 2}
              y={(ca.y + cb.y) / 2 - 14}
              textAnchor="middle"
              fontSize={ROAD_LABEL_FONT}
              fill={DOOR_FILL}
              fontWeight="bold"
              style={{ paintOrder: 'stroke fill', stroke: NIGHT, strokeWidth: ROAD_LABEL_HALO }}
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
    itemsByHex.forEach((bucket, hex) => {
      const c = hexCenterOf(hex);
      if (!c) return;
      const items = [
        ...bucket.pois.map((poi) => ({ kind: 'poi' as const, item: poi })),
        ...bucket.doors.map((door) => ({ kind: 'door' as const, item: door })),
      ];
      const visible = items.slice(0, MAX_VISIBLE_MARKERS);
      const overflow = items.length - visible.length;
      const slots = visible.length + (overflow > 0 ? 1 : 0);
      // A lone marker sits in the middle; several share a ring, the first
      // at the top. On the current hex the star has the middle, so markers
      // ring it on a wider circle, which would reach the coordinate label
      // above: the ring gets one more place than it has markers, and the
      // top one is left empty.
      const onCurrent = hex === currentHex;
      const radius = onCurrent
        ? STAR_RADIUS * size.star + CURRENT_RING_GAP * size.marker
        : slots === 1 ? 0 : MARKER_RING_RADIUS * size.marker;
      const places = onCurrent ? slots + 1 : slots;
      const firstPlace = onCurrent ? 1 : 0;
      const slotAt = (i: number) => {
        const angle = -Math.PI / 2 + ((i + firstPlace) / places) * Math.PI * 2;
        return { x: c.x + radius * Math.cos(angle), y: c.y + radius * Math.sin(angle) };
      };
      visible.forEach((entry, i) => {
        const m = slotAt(i);
        const markerProps = { ...MAP_BUTTON_PROPS, 'data-marker': entry.item.id, 'data-marker-hex': hex };
        if (entry.kind === 'poi') {
          const label = `POI: ${entry.item.name || 'Unnamed'}${notesPreview(entry.item.notes)}`;
          els.push(
            <g key={`poi-${entry.item.id}`} {...markerProps} aria-label={label}>
              <title>{label}</title>
              <circle cx={m.x} cy={m.y} r={POI_RADIUS * size.marker} fill={POI_FILL} stroke={PARCHMENT} strokeWidth={MARKER_RIM * size.marker} />
            </g>,
          );
        } else {
          const door = entry.item;
          const dest = door.destination;
          const destLabel = dest.kind === 'wild' ? 'wild → Fairy' : `roaded${dest.roadName ? ` via "${dest.roadName}"` : ''}`;
          const label = `Fairy Door: ${door.name || 'Unnamed'} (${destLabel})${notesPreview(door.notes)}`;
          els.push(
            <g key={`door-${door.id}`} {...markerProps} aria-label={label}>
              <title>{label}</title>
              <circle cx={m.x} cy={m.y} r={DOOR_RADIUS * size.marker} fill={DOOR_FILL} stroke={PARCHMENT} strokeWidth={MARKER_RIM * size.marker} />
              <text
                x={m.x}
                y={m.y + DOOR_GLYPH_FONT * size.marker * 0.32}
                textAnchor="middle"
                fontSize={DOOR_GLYPH_FONT * size.marker}
                fill={NIGHT}
                fontWeight="bold"
                pointerEvents="none"
                aria-hidden="true"
              >
                ✦
              </text>
            </g>,
          );
        }
      });
      if (overflow > 0) {
        const b = slotAt(visible.length);
        els.push(
          <g key={`overflow-${hex}`} pointerEvents="none" role="img" aria-label={`${overflow} more on hex ${hex}`}>
            <circle cx={b.x} cy={b.y} r={BADGE_RADIUS * size.marker} fill={NIGHT} stroke={PARCHMENT} strokeWidth={BADGE_RIM * size.marker} />
            <text x={b.x} y={b.y + BADGE_FONT * size.marker * 0.36} textAnchor="middle" fontSize={BADGE_FONT * size.marker} fill={PARCHMENT} fontWeight="bold">
              +{overflow}
            </text>
          </g>,
        );
      }
    });
    return els;
  };

  const renderCurrentLocation = () => {
    const c = currentHex ? hexCenterOf(currentHex) : null;
    if (!c) return null;
    return (
      <g pointerEvents="none" aria-hidden="true">
        <circle cx={c.x} cy={c.y} r={STAR_RADIUS * size.star} fill={GOLD} stroke={PARCHMENT} strokeWidth={STAR_RIM * size.star} />
        <text x={c.x} y={c.y + STAR_GLYPH_FONT * size.star * 0.32} textAnchor="middle" fontSize={STAR_GLYPH_FONT * size.star} fill={NIGHT} fontWeight="bold">
          ★
        </text>
      </g>
    );
  };

  // Outlines for the current, selected and hovered hexes, drawn over every
  // hex (an outline on a hex's own polygon is painted over by later hexes).
  const renderOutlines = () => (
    <g fill="none" pointerEvents="none" aria-hidden="true">
      {currentHex && HEX_PATHS.has(currentHex) && (
        <path d={HEX_PATHS.get(currentHex)} stroke={GOLD} strokeWidth={CURRENT_LINE_PX} vectorEffect="non-scaling-stroke" />
      )}
      {hoverHex && hoverHex !== selectedHex && (
        <path d={HEX_PATHS.get(hoverHex)} stroke={PARCHMENT} strokeOpacity={0.7} strokeWidth={HIGHLIGHT_LINE_PX} vectorEffect="non-scaling-stroke" />
      )}
      {selectedHex && HEX_PATHS.has(selectedHex) && (
        <path d={HEX_PATHS.get(selectedHex)} stroke={PARCHMENT} strokeWidth={HIGHLIGHT_LINE_PX} vectorEffect="non-scaling-stroke" />
      )}
    </g>
  );

  const zoomPercent = Math.round((baseBounds.w / view.w) * 100);
  const toolButton = 'bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 transition-colors';

  return (
    // scroll-mt keeps an element that focus moves to clear of the sticky header.
    <div ref={rootRef} className="space-y-4 [&_[data-focus-key]]:scroll-mt-24">
      <div className="bg-[#2a2a3e] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#5a3a28] pb-2 flex-wrap gap-2">
          <h2 className="text-lg font-bold text-[#c4a35a]">Dolmenwood Map</h2>
          <div className="flex items-center gap-3 text-xs text-[#f5e6c8]/80 flex-wrap">
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TERRAIN_FILL.woods }} /> Woods
            </div>
            <div className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TERRAIN_FILL.open }} /> Open
            </div>
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <button type="button" onClick={() => zoomBy(BUTTON_ZOOM_FACTOR)} aria-label="Zoom out" className={`${toolButton} w-7`}>
                −
              </button>
              <span className="min-w-[3rem] text-center tabular-nums" aria-live="polite">{zoomPercent}%</span>
              <button type="button" onClick={() => zoomBy(1 / BUTTON_ZOOM_FACTOR)} aria-label="Zoom in" className={`${toolButton} w-7`}>
                +
              </button>
            </div>
            <button type="button" onClick={resetView} className={toolButton}>
              Reset View
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-sm">
          {!draft ? (
            <button
              type="button"
              onClick={() => {
                startLeyLine();
                moveFocusTo('drawing-status');
              }}
              data-focus-key="draw-ley-line"
              className="bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] rounded px-3 py-1 transition-colors"
            >
              ≈ Draw Ley Line
            </button>
          ) : (
            <>
              <span role="status" tabIndex={-1} data-focus-key="drawing-status" className={`text-[#c4a35a] font-semibold ${FOCUS_RING}`}>
                Drawing ley line ({draft.hexes.length} hex{draft.hexes.length === 1 ? '' : 'es'})
              </span>
              <button
                type="button"
                onClick={() => {
                  finishLeyLine();
                  moveFocusTo('draw-ley-line');
                }}
                disabled={draft.hexes.length < 2}
                className="bg-[#c4a35a] disabled:opacity-40 hover:bg-[#d4b66a] text-[#1a1a2e] font-semibold rounded px-3 py-1 transition-colors"
              >
                Finish
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftLeyLine(null);
                  moveFocusTo('draw-ley-line');
                }}
                className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          <JumpToHexInput
            drafting={draft !== null}
            onJump={(hex) => {
              recenterOnHex(hex);
              handleHexClick(hex);
            }}
          />
          {!draft && (
            <span className="text-[#f5e6c8]/40 text-xs ml-auto basis-full md:basis-auto">
              <span className="pointer-coarse:hidden">
                Drag to pan · Scroll or +/− to zoom · Click a hex to inspect · Hover a marker for details
              </span>
              <span className="hidden pointer-coarse:inline">Drag to pan · Pinch or +/− to zoom · Tap a hex or marker to inspect</span>
              {' · '}Each hex is 6 miles across.
            </span>
          )}
        </div>
        {draft && <LeyLineDraftForm draft={draft} setDraft={setDraftLeyLine} />}
      </div>

      {/* On phones the box follows the grid's shape so the inspector below
          stays close; from md up it's a fixed 60vh. It's never taller than
          the screen below the sticky header, with room to spare, so the page
          can still be scrolled past it (dragging on the map pans the map):
          on a phone in landscape the map is letterboxed instead. */}
      <div
        ref={boxRef}
        className="bg-[#1a1a2e] rounded-lg overflow-hidden relative w-full aspect-(--map-aspect) md:aspect-auto md:h-[60vh] max-h-[calc(100svh-8rem)]"
        style={{ '--map-aspect': `${baseBounds.w} / ${baseBounds.h}` } as React.CSSProperties}
      >
        <svg
          ref={svgRef}
          data-focus-key="map"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          xmlns="http://www.w3.org/2000/svg"
          role="group"
          aria-label="Dolmenwood hex map. Arrow keys pan, plus and minus zoom."
          tabIndex={0}
          className="w-full h-full select-none touch-none focus-visible:outline-2 focus-visible:outline-[#c4a35a] focus-visible:-outline-offset-2"
          // No grey flash over the whole map on each tap in iOS Safari.
          style={{ cursor: isPanning ? 'grabbing' : undefined, WebkitTapHighlightColor: 'transparent' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerLeave}
          onClick={handleMapClick}
          onKeyDown={handleMapKeyDown}
        >
          <rect x={baseBounds.x} y={baseBounds.y} width={baseBounds.w} height={baseBounds.h} fill={NIGHT} />
          <g style={{ cursor: draft ? 'crosshair' : 'pointer' }}>
            <HexGridLayer currentHex={currentHex} />
          </g>
          {size.coordLabels && (
            <g opacity={COORD_LABEL_OPACITY} pointerEvents="none" aria-hidden="true">
              <CoordLabels />
            </g>
          )}
          <g>{renderLeyLines()}</g>
          {renderDraft()}
          <g>{renderDoorConnectors()}</g>
          <g>{renderMarkers()}</g>
          {renderCurrentLocation()}
          {renderOutlines()}
        </svg>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div ref={inspectorRef} className="scroll-mt-4">
          <HexInspectorPanel
            selectedHex={selectedHex}
            items={selectedHex ? itemsByHex.get(selectedHex) : undefined}
            allDoors={doors}
            updateMap={updateMap}
            pendingForm={pendingForm}
            setPendingForm={setPendingForm}
            currentLocationHex={currentHex}
            setCurrentLocation={setCurrentLocation}
            focus={focus}
            onClose={() => {
              clearSelection();
              moveFocusTo('map');
            }}
            moveFocusTo={moveFocusTo}
          />
        </div>
        <LeyLinesPanel
          leyLines={leyLines}
          updateMap={updateMap}
          selectedLeyLine={selectedLeyLine}
          onToggleSelected={(id) => (selectedLeyLine === id ? clearSelection() : selectLeyLine(id))}
          moveFocusTo={moveFocusTo}
        />
      </div>
    </div>
  );
}

// --- Go to hex (toolbar) ---
// Reaches any hex from the keyboard (hexes aren't in the Tab order): type a
// coordinate and press Enter or Go. Short input is left-padded ("303" →
// "0303"). While drawing a ley line it adds the hex to the line instead. Bad
// input keeps a red border and a status message until the text is edited.
function JumpToHexInput({ drafting, onJump }: { drafting: boolean; onJump: (hex: HexCoord) => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const statusId = useId();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = value.trim();
    const hex = /^\d{1,4}$/.test(raw) ? raw.padStart(4, '0') : '';
    if (!isValidHex(hex)) {
      setError(raw ? `No hex "${raw}" on the map` : 'Type a hex number, like 0303');
      return;
    }
    onJump(hex);
    setValue('');
    setError(null);
  };
  const border = error ? 'border-[#d4553a] focus:border-[#d4553a]' : 'border-[#5a3a28] focus:border-[#c4a35a]';
  return (
    <form onSubmit={submit} className="flex items-center gap-1 flex-wrap">
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="go"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (error) setError(null);
        }}
        placeholder={drafting ? 'Add to ley line' : 'Go to hex'}
        aria-label={drafting ? 'Add a hex to the ley line by typing its coordinate' : 'Jump to a hex by typing its 4-digit coordinate'}
        aria-invalid={error ? true : undefined}
        aria-describedby={statusId}
        className={`bg-[#1a1a2e] border ${border} text-[#f5e6c8] rounded px-2 py-1 text-base md:text-xs w-28 focus:outline-none`}
      />
      <button type="submit" className="bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-2 py-1 text-xs transition-colors">
        Go
      </button>
      <span id={statusId} role="status" className="text-xs text-[#ff8a70]">
        {error ?? ''}
      </span>
    </form>
  );
}

// --- Ley line draft form ---
function LeyLineDraftForm({
  draft,
  setDraft,
}: {
  draft: LeyLineDraft;
  setDraft: (next: (prev: LeyLineDraft | null) => LeyLineDraft | null) => void;
}) {
  const edit = (patch: Partial<LeyLineDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  return (
    <div className="mt-3 pt-3 border-t border-[#5a3a28] grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <input value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder="Name" aria-label="Ley line name" className={INPUT_ON_CARD} />
      <input value={draft.type} onChange={(e) => edit({ type: e.target.value })} placeholder="Type (Ley line, Ward…)" aria-label="Ley line type" className={INPUT_ON_CARD} />
      <input type="color" value={draft.color} onChange={(e) => edit({ color: e.target.value })} aria-label="Ley line colour" className="bg-[#1a1a2e] border border-[#5a3a28] rounded h-8 w-full" />
      <input value={draft.notes} onChange={(e) => edit({ notes: e.target.value })} placeholder="Notes" aria-label="Ley line notes" className={INPUT_ON_CARD} />
      <div className="col-span-full text-xs text-[#f5e6c8]/60">
        Click hexes in order. Click the last-added hex to undo it; click any earlier hex of the line to cut it back to there.
      </div>
    </div>
  );
}

// --- Hex inspector ---
function HexInspectorPanel({
  selectedHex,
  items,
  allDoors,
  updateMap,
  pendingForm,
  setPendingForm,
  currentLocationHex,
  setCurrentLocation,
  focus,
  onClose,
  moveFocusTo,
}: {
  selectedHex: HexCoord | null;
  items: { pois: MapPOI[]; doors: FairyDoor[] } | undefined;
  allDoors: FairyDoor[];
  updateMap: (fn: (md: CharacterMapData) => CharacterMapData) => void;
  pendingForm: { type: 'poi' | 'door'; hex: HexCoord } | null;
  setPendingForm: (f: { type: 'poi' | 'door'; hex: HexCoord } | null) => void;
  currentLocationHex: HexCoord | '';
  setCurrentLocation: (h: HexCoord) => void;
  focus: ({ id: string } & FocusRequest) | null;
  onClose: () => void;
  moveFocusTo: (key: string) => void;
}) {
  if (!selectedHex) {
    return (
      <div className="bg-[#2a2a3e] rounded-lg p-4 text-sm text-[#f5e6c8]/50 italic">
        Click a hex on the map to inspect it.
      </div>
    );
  }
  const pois = items?.pois ?? [];
  const doors = items?.doors ?? [];
  const singleton = pois.length + doors.length === 1;
  const terrain = HEX_CELLS[selectedHex]?.terrain;
  const isCurrent = currentLocationHex === selectedHex;
  const focusRequestFor = (id: string): FocusRequest | undefined =>
    focus?.id === id ? { seq: focus.seq, target: focus.target } : undefined;
  // The action buttons give way to the chosen form; Add or Cancel brings them back.
  const activeForm = pendingForm?.hex === selectedHex ? pendingForm.type : null;
  const actionButton = 'bg-[#5a3a28] hover:bg-[#8b6b52] text-[#f5e6c8] rounded px-3 py-2 transition-colors';
  // After a delete, focus goes to the next item on the hex, or the title.
  const itemIds = [...pois.map((p) => p.id), ...doors.map((d) => d.id)];
  const focusAfterDelete = (id: string) => {
    const next = itemIds[itemIds.indexOf(id) + 1];
    moveFocusTo(next ? `item:${next}` : 'inspector-title');
  };

  const savePoi = (id: string, patch: Partial<MapPOI>) =>
    updateMap((md) => ({ ...md, pois: md.pois.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const saveDoorText = (id: string, patch: Partial<Pick<FairyDoor, 'name' | 'notes'>>) =>
    updateMap((md) => ({ ...md, fairyDoors: md.fairyDoors.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  // Pairing is validated and both ends updated from the doors as they are
  // when the update runs, not as this render saw them.
  const saveDoorDestination = (id: string, destination: FairyDoorDestination) =>
    updateMap((md) => {
      const door = md.fairyDoors.find((x) => x.id === id);
      return door ? { ...md, fairyDoors: upsertFairyDoor(md.fairyDoors, { ...door, destination }) } : md;
    });

  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-[#5a3a28] pb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 tabIndex={-1} data-focus-key="inspector-title" className={`text-[#c4a35a] font-bold ${FOCUS_RING}`}>
            Hex {selectedHex}
          </h3>
          <span className="text-[#f5e6c8]/60 text-xs">{terrain}</span>
          {isCurrent && <span className="text-[#c4a35a] text-xs">★ current</span>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close hex inspector" className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] text-xs transition-colors">
          ✕
        </button>
      </div>

      {activeForm === 'poi' && (
        <POIForm
          hex={selectedHex}
          onSubmit={(poi) => {
            updateMap((md) => ({ ...md, pois: [...md.pois, poi] }));
            setPendingForm(null);
            moveFocusTo(`item:${poi.id}`);
          }}
          onCancel={() => {
            setPendingForm(null);
            moveFocusTo('add-poi');
          }}
        />
      )}
      {activeForm === 'door' && (
        <DoorForm
          hex={selectedHex}
          allDoors={allDoors}
          onSubmit={(door) => {
            updateMap((md) => ({ ...md, fairyDoors: upsertFairyDoor(md.fairyDoors, door) }));
            setPendingForm(null);
            moveFocusTo(`item:${door.id}`);
          }}
          onCancel={() => {
            setPendingForm(null);
            moveFocusTo('add-door');
          }}
        />
      )}
      {activeForm === null && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          {/* aria-disabled, not disabled: a button disabled while it has
              focus (it is, once clicked) drops focus to the page. */}
          <button
            type="button"
            onClick={() => {
              if (!isCurrent) setCurrentLocation(selectedHex);
            }}
            aria-disabled={isCurrent}
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] aria-disabled:opacity-40 aria-disabled:hover:bg-[#2d4a2e] aria-disabled:cursor-default text-[#f5e6c8] rounded px-3 py-2 transition-colors"
          >
            📍 Set Current
          </button>
          <button type="button" onClick={() => setPendingForm({ type: 'poi', hex: selectedHex })} data-focus-key="add-poi" className={actionButton}>
            + POI
          </button>
          <button type="button" onClick={() => setPendingForm({ type: 'door', hex: selectedHex })} data-focus-key="add-door" className={actionButton}>
            ✦ Fairy Door
          </button>
        </div>
      )}

      {(pois.length > 0 || doors.length > 0) && (
        <div className="space-y-3 pt-1 border-t border-[#5a3a28]">
          {pois.length > 0 && (
            <div>
              <h4 className="text-[#c4a35a] text-xs uppercase tracking-wide font-semibold mb-1">Points of Interest</h4>
              <div className="space-y-2">
                {pois.map((p) => (
                  <POIEditor
                    key={p.id}
                    poi={p}
                    singleton={singleton}
                    focusRequest={focusRequestFor(p.id)}
                    onSave={(patch) => savePoi(p.id, patch)}
                    onDelete={() => {
                      updateMap((md) => ({ ...md, pois: md.pois.filter((x) => x.id !== p.id) }));
                      focusAfterDelete(p.id);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {doors.length > 0 && (
            <div>
              <h4 className="text-[#c4a35a] text-xs uppercase tracking-wide font-semibold mb-1">Fairy Doors</h4>
              <div className="space-y-2">
                {doors.map((d) => (
                  <DoorEditor
                    key={d.id}
                    door={d}
                    allDoors={allDoors}
                    singleton={singleton}
                    focusRequest={focusRequestFor(d.id)}
                    onSaveText={(patch) => saveDoorText(d.id, patch)}
                    onSaveDestination={(destination) => saveDoorDestination(d.id, destination)}
                    onDelete={() => {
                      updateMap((md) => ({ ...md, fairyDoors: deleteFairyDoor(md.fairyDoors, d.id) }));
                      focusAfterDelete(d.id);
                    }}
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
function POIForm({ hex, onSubmit, onCancel }: { hex: HexCoord; onSubmit: (p: MapPOI) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ id: newId(), hex, name: name.trim(), notes: notes.trim() });
  };
  return (
    <form onSubmit={submit} className="bg-[#1a1a2e] rounded p-2 mb-2 space-y-1">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Point of interest name" className={`w-full ${INPUT_ON_ITEM}`} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Point of interest notes" rows={2} className={`w-full ${INPUT_ON_ITEM}`} />
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={onCancel} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={!name.trim()} className="bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-40 text-[#f5e6c8] rounded px-3 py-1 transition-colors">
          Add
        </button>
      </div>
    </form>
  );
}

function POIEditor({
  poi,
  singleton,
  focusRequest,
  onSave,
  onDelete,
}: {
  poi: MapPOI;
  singleton: boolean;
  focusRequest: FocusRequest | undefined;
  onSave: (patch: Partial<MapPOI>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useExpanded(singleton, focusRequest?.seq);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useFocusOnRequest(focusRequest, rootRef, nameRef);
  const label = poi.name || 'unnamed';
  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Point of interest ${label}`}
      tabIndex={-1}
      data-focus-key={`item:${poi.id}`}
      className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${FOCUS_RING}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#8b2500] shrink-0" aria-hidden="true" />
        <input
          ref={nameRef}
          value={poi.name}
          onChange={(e) => onSave({ name: e.target.value })}
          aria-label="Point of interest name"
          className="flex-1 min-w-0 bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          aria-label={`Notes for ${label}`}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors whitespace-nowrap"
        >
          Notes <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete POI ${label}`} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
          Del
        </button>
      </div>
      {expanded && (
        <textarea
          value={poi.notes}
          onChange={(e) => onSave({ notes: e.target.value })}
          placeholder="Notes"
          aria-label={`Notes for ${label}`}
          rows={3}
          className={`w-full ${INPUT_ON_ITEM}`}
        />
      )}
    </div>
  );
}

// --- Fairy door form / editor ---

/** Wild/roaded radio pair; one `name` per form so they act as one group. */
function DestinationKindRadios({ kind, onChange, wildLabel, roadedLabel }: {
  kind: 'wild' | 'roaded';
  onChange: (k: 'wild' | 'roaded') => void;
  wildLabel: string;
  roadedLabel: string;
}) {
  const name = useId();
  return (
    <div className="flex gap-3 text-xs" role="radiogroup" aria-label="Where the door leads">
      <label className="flex items-center gap-1 cursor-pointer">
        <input type="radio" name={name} checked={kind === 'wild'} onChange={() => onChange('wild')} />
        {wildLabel}
      </label>
      <label className="flex items-center gap-1 cursor-pointer">
        <input type="radio" name={name} checked={kind === 'roaded'} onChange={() => onChange('roaded')} />
        {roadedLabel}
      </label>
    </div>
  );
}

function DoorForm({
  hex,
  allDoors,
  onSubmit,
  onCancel,
}: {
  hex: HexCoord;
  allDoors: FairyDoor[];
  onSubmit: (d: FairyDoor) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [kind, setKind] = useState<'wild' | 'roaded'>('wild');
  const [pairedDoorId, setPairedDoorId] = useState('');
  const [roadName, setRoadName] = useState('');
  // Recomputed every render from the live doors, so a partner deleted while
  // the form is open drops out of the list (and the choice is cleared).
  const pairable = pairableDoors(allDoors, null);
  const partnerOk = pairable.some((d) => d.id === pairedDoorId);
  const canAdd = name.trim() !== '' && (kind === 'wild' || partnerOk);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    const destination: FairyDoorDestination =
      kind === 'wild' ? { kind: 'wild' } : { kind: 'roaded', pairedDoorId, roadName: roadName.trim() };
    onSubmit({ id: newId(), hex, name: name.trim(), notes: notes.trim(), destination });
  };

  return (
    <form onSubmit={submit} className="bg-[#1a1a2e] rounded p-2 mb-2 space-y-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Door in the Old Oak)" aria-label="Fairy door name" className={`w-full ${INPUT_ON_ITEM}`} />
      <DestinationKindRadios kind={kind} onChange={setKind} wildLabel="Wild (into Fairy)" roadedLabel="Roaded (paired)" />
      {kind === 'roaded' && (
        <div className="space-y-1">
          <select value={partnerOk ? pairedDoorId : ''} onChange={(e) => setPairedDoorId(e.target.value)} aria-label="Fairy door at the other end of the road" className={`w-full ${INPUT_ON_ITEM}`}>
            <option value="">— pick the door at the other end —</option>
            {pairable.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name || 'Unnamed'} ({d.hex})
              </option>
            ))}
          </select>
          <input value={roadName} onChange={(e) => setRoadName(e.target.value)} placeholder="Road name (e.g. The Silver Road)" aria-label="Fairy road name" className={`w-full ${INPUT_ON_ITEM}`} />
        </div>
      )}
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" aria-label="Fairy door notes" rows={2} className={`w-full ${INPUT_ON_ITEM}`} />
      <div className="flex justify-end gap-2 text-xs">
        <button type="button" onClick={onCancel} className="text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors">
          Cancel
        </button>
        <button type="submit" disabled={!canAdd} className="bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-40 text-[#f5e6c8] rounded px-3 py-1 transition-colors">
          Add
        </button>
      </div>
    </form>
  );
}

type DestinationDraft = { kind: 'wild' | 'roaded'; pairedDoorId: string; roadName: string };
const destinationDraft = (d: FairyDoorDestination): DestinationDraft =>
  d.kind === 'roaded' ? { kind: 'roaded', pairedDoorId: d.pairedDoorId, roadName: d.roadName } : { kind: 'wild', pairedDoorId: '', roadName: '' };

function DoorEditor({
  door,
  allDoors,
  singleton,
  focusRequest,
  onSaveText,
  onSaveDestination,
  onDelete,
}: {
  door: FairyDoor;
  allDoors: FairyDoor[];
  singleton: boolean;
  focusRequest: FocusRequest | undefined;
  onSaveText: (patch: Partial<Pick<FairyDoor, 'name' | 'notes'>>) => void;
  onSaveDestination: (d: FairyDoorDestination) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useExpanded(singleton, focusRequest?.seq);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useFocusOnRequest(focusRequest, rootRef, nameRef);
  // Name and notes save as you type. The destination is edited here and
  // only saved with "Save destination", since it changes other doors too.
  // Re-sync the edit when the saved destination changes underneath it (e.g.
  // another door re-pointed this one); compared by reference.
  const [draft, setDraft] = useState(() => destinationDraft(door.destination));
  const [syncedDestination, setSyncedDestination] = useState(door.destination);
  if (syncedDestination !== door.destination) {
    setSyncedDestination(door.destination);
    setDraft(destinationDraft(door.destination));
  }
  const pairable = pairableDoors(allDoors, door.id);
  const partnerOk = pairable.some((d) => d.id === draft.pairedDoorId);
  const canSave = draft.kind === 'wild' || partnerOk;
  const partnerId = door.destination.kind === 'roaded' ? door.destination.pairedDoorId : null;
  const partner = partnerId ? allDoors.find((d) => d.id === partnerId) ?? null : null;
  const label = door.name || 'unnamed';

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Fairy door ${label}`}
      tabIndex={-1}
      data-focus-key={`item:${door.id}`}
      className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${FOCUS_RING}`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-[#a774d6] shrink-0" aria-hidden="true" />
        <input
          ref={nameRef}
          value={door.name}
          onChange={(e) => onSaveText({ name: e.target.value })}
          aria-label="Fairy door name"
          className="flex-1 min-w-0 bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <span className="text-xs text-[#f5e6c8]/40">{door.destination.kind === 'wild' ? 'wild' : `→ ${partner?.hex ?? '?'}`}</span>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          aria-label={`Edit ${label}`}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors whitespace-nowrap"
        >
          Edit <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete fairy door ${label}`} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
          Del
        </button>
      </div>
      {expanded && (
        <div className="space-y-1 pt-1">
          {/* Switching back to Roaded restores the last pick if that door is
              still pairable; otherwise the list shows "— pick paired door —". */}
          <DestinationKindRadios kind={draft.kind} onChange={(kind) => setDraft((d) => ({ ...d, kind }))} wildLabel="Wild" roadedLabel="Roaded" />
          {draft.kind === 'roaded' && (
            <>
              <select
                value={partnerOk ? draft.pairedDoorId : ''}
                onChange={(e) => setDraft((d) => ({ ...d, pairedDoorId: e.target.value }))}
                aria-label={`Fairy door at the other end of ${label}'s road`}
                className={`w-full ${INPUT_ON_ITEM}`}
              >
                <option value="">— pick paired door —</option>
                {pairable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || 'Unnamed'} ({d.hex})
                  </option>
                ))}
              </select>
              <input
                value={draft.roadName}
                onChange={(e) => setDraft((d) => ({ ...d, roadName: e.target.value }))}
                placeholder="Road name"
                aria-label={`Road name for ${label}`}
                className={`w-full ${INPUT_ON_ITEM}`}
              />
            </>
          )}
          <textarea
            value={door.notes}
            onChange={(e) => onSaveText({ notes: e.target.value })}
            placeholder="Notes"
            aria-label={`Notes for ${label}`}
            rows={2}
            className={`w-full ${INPUT_ON_ITEM}`}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (!canSave) return;
                onSaveDestination(
                  draft.kind === 'wild'
                    ? { kind: 'wild' }
                    : { kind: 'roaded', pairedDoorId: draft.pairedDoorId, roadName: draft.roadName.trim() },
                );
              }}
              disabled={!canSave}
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

// --- Ley lines list panel ---
function LeyLinesPanel({
  leyLines,
  updateMap,
  selectedLeyLine,
  onToggleSelected,
  moveFocusTo,
}: {
  leyLines: LeyLine[];
  updateMap: (fn: (md: CharacterMapData) => CharacterMapData) => void;
  selectedLeyLine: string | null;
  onToggleSelected: (id: string) => void;
  moveFocusTo: (key: string) => void;
}) {
  return (
    <div className="bg-[#2a2a3e] rounded-lg p-4">
      <h3
        tabIndex={-1}
        data-focus-key="ley-lines-title"
        className={`text-[#c4a35a] text-sm font-semibold mb-2 border-b border-[#5a3a28] pb-1 ${FOCUS_RING}`}
      >
        Ley Lines &amp; Crossings
      </h3>
      {leyLines.length === 0 ? (
        <div className="text-xs text-[#f5e6c8]/40 italic">None yet. Use “Draw Ley Line” above.</div>
      ) : (
        <div className="space-y-2">
          {leyLines.map((ll, i) => (
            <LeyLineEditor
              key={ll.id}
              leyLine={ll}
              selected={selectedLeyLine === ll.id}
              onSelect={() => onToggleSelected(ll.id)}
              onSave={(patch) =>
                updateMap((md) => ({ ...md, leyLines: md.leyLines.map((x) => (x.id === ll.id ? { ...x, ...patch } : x)) }))
              }
              onDelete={() => {
                updateMap((md) => ({ ...md, leyLines: md.leyLines.filter((x) => x.id !== ll.id) }));
                // Focus goes to the next ley line, or the panel's title.
                const next = leyLines[i + 1];
                moveFocusTo(next ? `ley-line:${next.id}` : 'ley-lines-title');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeyLineEditor({
  leyLine,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  leyLine: LeyLine;
  selected: boolean;
  onSelect: () => void;
  onSave: (patch: Partial<LeyLine>) => void;
  onDelete: () => void;
}) {
  const label = leyLine.name || 'unnamed ley line';
  return (
    <div
      role="group"
      aria-label={`${leyLine.type || DEFAULT_LEY_LINE_TYPE} ${leyLine.name || 'unnamed'}`}
      tabIndex={-1}
      data-focus-key={`ley-line:${leyLine.id}`}
      className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${selected ? 'ring-1 ring-[#c4a35a]/60' : ''} ${FOCUS_RING}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={`Toggle highlight for ${label}`}
          className="w-3 h-3 rounded-full shrink-0 border border-[#f5e6c8]/40"
          style={{ background: leyLine.color }}
        />
        <input
          value={leyLine.name}
          onChange={(e) => onSave({ name: e.target.value })}
          aria-label="Ley line name"
          className="flex-1 min-w-0 bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]"
        />
        <span className="text-xs text-[#f5e6c8]/40">
          {leyLine.hexes.length} hex{leyLine.hexes.length === 1 ? '' : 'es'}
        </span>
        <button type="button" onClick={onDelete} aria-label={`Delete ley line ${leyLine.name || 'unnamed'}`} className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors">
          Del
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <input value={leyLine.type} onChange={(e) => onSave({ type: e.target.value })} placeholder="Type" aria-label={`Type of ${label}`} className={INPUT_ON_ITEM} />
        <input type="color" value={leyLine.color} onChange={(e) => onSave({ color: e.target.value })} aria-label={`Colour of ${label}`} className="bg-[#2a2a3e] border border-[#5a3a28] rounded h-8 md:h-6 w-full" />
        <input value={leyLine.notes} onChange={(e) => onSave({ notes: e.target.value })} placeholder="Notes" aria-label={`Notes for ${label}`} className={INPUT_ON_ITEM} />
      </div>
      <div className="text-[10px] text-[#f5e6c8]/40 truncate">{leyLine.hexes.join(' → ')}</div>
    </div>
  );
}
