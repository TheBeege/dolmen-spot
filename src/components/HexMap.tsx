'use client';

import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  PoiKind,
} from '@/lib/types';
import { ALL_HEXES, HEX_CELLS, HEX_GRID_META } from '@/lib/hex-grid';
import {
  MIN_VIEW_FRACTION,
  PAN_MARGIN,
  gridBounds,
  hexCenterOf,
  hexPath,
  hexVertices,
  isValidHex,
  nearestPointOnMap,
  parseTypedHex,
  pixelToHex,
} from '@/lib/hex';
import {
  BADGE_RADIUS,
  HEX_INNER_RADIUS,
  MARKER_RADIUS,
  MARKER_RIM,
  STAR_RADIUS,
  countOnStar,
  layoutRing,
  markerGrowth,
  ringFor,
  type MarkerKind,
} from '@/lib/marker-layout';
import {
  DEFAULT_LEY_LINE_TYPE,
  LEY_LINE_COLORS,
  POI_KINDS,
  POI_KIND_LABELS,
  POI_KIND_NAMES,
  deleteFairyDoor,
  isPathKind,
  pairableDoors,
  pathKindFromType,
  poiKindOf,
  poiLabel,
  upsertFairyDoor,
  withMapLists,
  withPoiKind,
} from '@/lib/map-data';
import { countEntriesByHex, getJournalEntries } from '@/lib/journal';
import { newId } from '@/lib/ids';
import type { MapSearchHit } from '@/lib/map-search';
import { FOCUS_RING } from '@/components/focus-ring';
import MapSearch from '@/components/MapSearch';
import { DOOR_FILL, DoorIcon, GOLD, MarkerShape, NIGHT, PARCHMENT, PoiIcon, markerLook } from './MapIcons';

interface HexMapProps {
  character: Character;
  onChange: (updates: CharacterUpdater) => void;
  onOpenJournal: (hex: HexCoord) => void; // opens the Journal tab, filtered to that hex
}

// --- Colours: the terrain's. The theme's parchment, night and gold, and the
// markers' own colours, are in MapIcons.tsx. ---
const TERRAIN_FILL = { woods: '#2d4a2e', open: '#4a3a26' } as const;
const GRID_STROKE = '#5a3a28';

// --- Sizes in image units (the printed map's pixels); they scale with zoom ---
// Marker and star sizes, and how they grow, are in marker-layout.ts.
const HEX_SIZE = HEX_GRID_META.hexSize;
const MAX_VISIBLE_MARKERS = 4; // more than this collapse into a "+N" badge
const LEY_LINE_WIDTH = 14;
const CONNECTOR_WIDTH = 8;
const COORD_LABEL_FONT = 30;
const COORD_LABEL_OFFSET = HEX_SIZE * 0.55; // label sits this far above the centre
const DRAFT_STEP_FONT = 50;
const ROAD_LABEL_FONT = 34;
const BADGE_FONT = 28; // the "+N" overflow badge
const STAR_GLYPH_FONT = 56; // the ★ of the current location
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
// at least this big (markers, the star and combined markers: markerGrowth).
// Labels that would be smaller are hidden instead.
const MIN_LEY_LINE_PX = 2.5;
const MIN_ROAD_LINE_PX = 1.5;
const MIN_STEP_FONT_PX = 10; // step numbers of a ley line being drawn
const MIN_LABEL_FONT_PX = 8; // hex coordinates and fairy road names
const COORD_LABEL_OPACITY = 0.7;

// --- Navigation ---
const PAN_THRESHOLD_PX = 4; // movement before a press becomes a pan, so taps still select
const CLICK_AFTER_GESTURE_MS = 250; // a pointer's click this soon after a pan or pinch ends belongs to it
// Most zoomed in: MIN_VIEW_FRACTION of the map's width (hex.ts, tied to the pan limit).
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
  'border border-[#5a3a28] text-[#f5e6c8] rounded px-2 py-1 text-base md:text-sm focus:outline-none focus:border-[#c4a35a] placeholder:text-[#9c948b]';
const INPUT_ON_CARD = `bg-[#1a1a2e] ${INPUT_BASE}`; // on a #2a2a3e card
const INPUT_ON_ITEM = `bg-[#2a2a3e] ${INPUT_BASE}`; // inside a #1a1a2e item box

// An editor row's name keeps this floor, so the controls beside it (Edit,
// Delete, a destination) wrap below the field instead of squeezing it to a
// sliver. In rem, so it grows with the default font size, but never wider than
// the row: Inventory.tsx's NAME_MIN_WIDTH.
const NAME_MIN_WIDTH = 'min-w-[min(6rem,100%)]';
// The destructive text tone tagged in globals.css, for a remove button.
const DELETE_BUTTON = 'text-xs text-[#ff9a85] hover:text-[#ffd0c4] transition-colors';

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

/** One of a hex's items: a point of interest or a fairy door. */
type HexItem = { type: 'poi'; item: MapPOI } | { type: 'door'; item: FairyDoor };

/** The marker an item gets: a fairy door, a point of interest's kind icon, or the plain dot. */
function markerKindOf(e: HexItem): MarkerKind {
  if (e.type === 'door') return 'door';
  return poiKindOf(e.item) === 'other' ? 'poi' : 'icon';
}

const lookOf = (e: HexItem) => markerLook(e.type === 'door' ? 'door' : poiKindOf(e.item));

/** An item in a combined marker's list: "Lankshorn (town)". */
function itemSummary(e: HexItem): string {
  const what = e.type === 'door' ? 'fairy door' : POI_KIND_NAMES[poiKindOf(e.item)].toLowerCase();
  return `${e.item.name || 'Unnamed'} (${what})`;
}

// Markers and ley lines are buttons for keyboard and screen-reader users.
// Their clicks and Enter/Space presses are handled once, on the SVG, by
// reading their data-* attributes (see activateMapItem).
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

/**
 * `v`, moved if needed so that its centre stays over the map: within half a
 * hex of the hull of the hex centres. However far a pan, pinch, scroll or
 * arrow key goes, hexes stay in the box, and since that region is convex,
 * a drag along its edge moves the view smoothly.
 */
function keepOnMap(v: View): View {
  const c = viewCenter(v);
  const p = nearestPointOnMap(c, PAN_MARGIN);
  return p === c ? v : { ...v, x: p.x - v.w / 2, y: p.y - v.h / 2 };
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

export default function HexMap({ character, onChange, onOpenJournal }: HexMapProps) {
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

  // A result of the search box: the map recentres on the item's hex, selects it
  // and moves focus to the item — in the hex inspector for a point of interest
  // or a fairy door, and in the Ley Lines panel for a path, whose editor isn't
  // in the inspector. Focus goes to the editor rather than its name field, as
  // for a tap on a marker, so that a phone doesn't raise its keyboard on the
  // way (the search box, being a field, had it up).
  const goToSearchHit = (hit: MapSearchHit) => {
    if (!hit.hex) {
      // A path recorded on no hex yet: there's nowhere to go, so it's only
      // taken up, the way its own row in the panel reads.
      if (hit.type === 'path') {
        selectLeyLine(hit.id);
        moveFocusTo(`ley-line:${hit.id}`);
      }
      return;
    }
    recenterOnHex(hit.hex);
    if (hit.type === 'path') {
      selectLeyLine(hit.id);
      moveFocusTo(`ley-line:${hit.id}`);
    } else {
      selectHex(hit.hex, hit.id, 'item');
    }
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
  // Until when a click belongs to the pan or pinch that just ended and
  // mustn't select anything. Browsers fire one right after a mouse drag, and
  // after a touch drag that stayed within their tap slop (about 15 px, more
  // than our 4 px pan threshold). A new press resets it, it runs out soon,
  // and it never applies to a click no pointer made (a TalkBack double-tap).
  const suppressClickUntilRef = useRef(0);
  // The pointer type of the last press, for clicks that don't report one.
  const lastPointerTypeRef = useRef('');
  // Where the last touch or pen press went down, in client coordinates.
  // Touch browsers move a tap's click to a nearby clickable element (touch
  // adjustment): markers are focusable and hexes aren't, so a tap near a
  // marker would open the marker's hex. A tap is resolved to the element
  // under the finger instead.
  const tapPointRef = useRef<Point | null>(null);

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
    tapPointRef.current = e.pointerType === 'touch' || e.pointerType === 'pen' ? { x: e.clientX, y: e.clientY } : null;
    // A new interaction: forget a suppression left by an earlier gesture.
    suppressClickUntilRef.current = 0;
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
    if (g !== null && (g.kind === 'pinch' || g.moved)) {
      suppressClickUntilRef.current = performance.now() + CLICK_AFTER_GESTURE_MS;
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
    const tapPoint = tapPointRef.current;
    tapPointRef.current = null;
    // Current browsers make the click a PointerEvent. Its pointerType is ''
    // when no pointer made it (assistive technology, the keyboard), and such
    // a click is never the end of a gesture. In other browsers the last
    // press's pointer type stands in.
    const clickType = (e.nativeEvent as Partial<PointerEvent>).pointerType;
    // The click that ends a pan or pinch isn't a selection.
    if (clickType !== '' && performance.now() < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      return;
    }
    const pointerType = clickType ?? lastPointerTypeRef.current;
    const tapped = pointerType === 'touch' || pointerType === 'pen';
    // A tap opens what was under the finger, not what touch adjustment moved
    // the click to (see tapPointRef).
    const underFinger = tapped && tapPoint ? document.elementFromPoint(tapPoint.x, tapPoint.y) : null;
    const target = underFinger && svgRef.current?.contains(underFinger) ? underFinger : (e.target as Element);
    // A tap on a marker focuses its editor, not the name field, so that a
    // phone or tablet doesn't raise its keyboard.
    activateMapItem(target, tapped ? 'item' : 'name');
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

  // Zooming, or the map box changing size, can swap a hex's separate markers
  // for one combined marker or back. If one of them had focus, focus would
  // fall to the page, and the keys that pan and zoom would stop working until
  // the player tabbed back in. Instead it moves to whatever now marks that
  // hex: its combined marker, or the first of its separate ones (or failing
  // both, the map).
  const focusedMarkerRef = useRef<{ el: Element; hex: HexCoord } | null>(null);
  const handleMapFocus = (e: React.FocusEvent<SVGSVGElement>) => {
    const el = e.target as Element;
    const hex = el.getAttribute('data-marker-hex') ?? (el.getAttribute('role') === 'button' ? el.getAttribute('data-hex') : null);
    focusedMarkerRef.current = hex ? { el, hex } : null;
  };
  const handleMapBlur = (e: React.FocusEvent<SVGSVGElement>) => {
    const el = e.target as Element;
    // Forget the marker if the player moved focus away from it. If it lost
    // focus by being removed, it's gone by now; the effect below handles that.
    queueMicrotask(() => {
      if (focusedMarkerRef.current?.el === el && el.isConnected) focusedMarkerRef.current = null;
    });
  };
  useLayoutEffect(() => {
    const focused = focusedMarkerRef.current;
    if (!focused || focused.el.isConnected) return;
    focusedMarkerRef.current = null;
    const svg = svgRef.current;
    const active = document.activeElement;
    if (!svg || (active && active !== document.body && active !== document.documentElement)) return;
    const hex = CSS.escape(focused.hex);
    const next = svg.querySelector<SVGElement>(`[role="button"][data-hex="${hex}"], [data-marker-hex="${hex}"]`) ?? svg;
    next.focus({ preventScroll: true });
  });

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
      const type = fresh.type || DEFAULT_LEY_LINE_TYPE;
      const newLine: LeyLine = {
        id: newLineId,
        kind: isPathKind(fresh.kind) ? fresh.kind : pathKindFromType(type),
        type,
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
      kind: pathKindFromType(DEFAULT_LEY_LINE_TYPE),
    });
    clearSelection();
  };

  // Journal entries written in each hex, for the inspector's link to them.
  // Kept between renders, which come at every step of a pan or zoom.
  const journalEntries = character.journalEntries;
  const journalCounts = useMemo(() => countEntriesByHex(getJournalEntries({ journalEntries })).byHex, [journalEntries]);

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
  const growth = markerGrowth(pxPerUnit);
  const size = {
    marker: growth.marker, // scale for all marker geometry
    leyLine,
    leyLineScale: leyLine / LEY_LINE_WIDTH,
    roadLine,
    roadLineScale: roadLine / CONNECTOR_WIDTH,
    stepFont: atLeast(DRAFT_STEP_FONT, MIN_STEP_FONT_PX),
    coordLabels: legible(COORD_LABEL_FONT),
    roadLabels: legible(ROAD_LABEL_FONT),
  };
  const starRadius = growth.starRadius;

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
      const items: HexItem[] = [
        ...bucket.pois.map((poi) => ({ type: 'poi' as const, item: poi })),
        ...bucket.doors.map((door) => ({ type: 'door' as const, item: door })),
      ];
      const visible = items.slice(0, MAX_VISIBLE_MARKERS);
      const overflow = items.length - visible.length;
      // A lone marker sits in the middle; several share a ring, the first at
      // the top; on the current hex they ring the star, with the top place
      // left free for the coordinate label (layoutRing). Markers always stay
      // inside their hex: where they'd crowd each other or the star, as when
      // zoomed out on a phone, the hex gets one combined marker instead.
      const onCurrent = hex === currentHex;
      // Each marker's kind is worked out once, for its place in the ring and
      // for its size.
      const slots = visible.map((entry) => ({ entry, kind: markerKindOf(entry) }));
      const layout = layoutRing(ringFor({ kinds: slots.map((slot) => slot.kind), badge: overflow > 0, onCurrent, growth }));
      if (layout.kind === 'combined') {
        els.push(renderCombinedMarker(hex, c, items, onCurrent));
        return;
      }
      const slotAt = (i: number) => ({ x: c.x + layout.offsets[i].x, y: c.y + layout.offsets[i].y });
      slots.forEach(({ entry, kind }, i) => {
        const m = slotAt(i);
        const markerProps = { ...MAP_BUTTON_PROPS, 'data-marker': entry.item.id, 'data-marker-hex': hex };
        let label: string;
        if (entry.type === 'poi') {
          label = `${poiLabel(entry.item)}${notesPreview(entry.item.notes)}`;
        } else {
          const door = entry.item;
          const dest = door.destination;
          const destLabel = dest.kind === 'wild' ? 'wild → Fairy' : `roaded${dest.roadName ? ` via "${dest.roadName}"` : ''}`;
          label = `Fairy Door: ${door.name || 'Unnamed'} (${destLabel})${notesPreview(door.notes)}`;
        }
        // The icon is decorative: the marker's label names the item and its kind.
        els.push(
          <g key={`${entry.type}-${entry.item.id}`} {...markerProps} aria-label={label}>
            <title>{label}</title>
            <MarkerShape
              look={lookOf(entry)}
              cx={m.x}
              cy={m.y}
              r={MARKER_RADIUS[kind] * size.marker}
              rim={MARKER_RIM * size.marker}
            />
          </g>,
        );
      });
      if (overflow > 0) {
        const b = slotAt(visible.length);
        els.push(
          <g key={`overflow-${hex}`} pointerEvents="none" role="img" aria-label={`${overflow} more on hex ${hex}`}>
            <circle cx={b.x} cy={b.y} r={BADGE_RADIUS * size.marker} fill={NIGHT} stroke={PARCHMENT} strokeWidth={BADGE_RIM * size.marker} className="marker-disc" />
            <text x={b.x} y={b.y + BADGE_FONT * size.marker * 0.36} textAnchor="middle" fontSize={BADGE_FONT * size.marker} fill={PARCHMENT} fontWeight="bold" className="marker-ink">
              +{overflow}
            </text>
          </g>,
        );
      }
    });
    return els;
  };

  // One marker for all of a hex's items when they don't fit in it separately:
  // their count, in the middle of the hex, or over the star's lower right on
  // the current hex. It opens the hex, whose inspector lists the items. It
  // has its items' colours if they all share them (plain points of interest,
  // ones with kinds, or fairy doors), and is dark otherwise.
  const renderCombinedMarker = (hex: HexCoord, c: Point, items: HexItem[], onCurrent: boolean) => {
    const label = `${items.length} ${items.length === 1 ? 'item' : 'items'} on hex ${hex}: ${items.map(itemSummary).join(', ')}`;
    const r = onCurrent ? growth.countRadius : growth.combinedRadius;
    const o = onCurrent ? countOnStar(starRadius, r, HEX_INNER_RADIUS) : { x: 0, y: 0 };
    const looks = items.map(lookOf);
    // The disc takes the colour its items share (the plain one's red, or a
    // door's lavender), and is dark otherwise; the rim never does (below).
    const shared = !onCurrent && looks.every((l) => l.fill === looks[0].fill) ? looks[0] : null;
    const fill = shared?.fill ?? NIGHT;
    return (
      <g key={`combined-${hex}`} {...MAP_BUTTON_PROPS} data-hex={hex} aria-label={label}>
        <title>{label}</title>
        {/* The rim is parchment whatever the items: a gold one belongs to a
            kind's own marker, so a count never wears one and its digit never
            reads as a kind. The classes are forced colours' (globals.css). */}
        <circle cx={c.x + o.x} cy={c.y + o.y} r={r} fill={fill} stroke={PARCHMENT} strokeWidth={r * 0.15} className="marker-disc" />
        <text
          x={c.x + o.x}
          y={c.y + o.y + r * 0.5}
          textAnchor="middle"
          fontSize={r * 1.4}
          // Dark on the pale door fill, like a door's glyph; pale on the others.
          fill={fill === DOOR_FILL ? NIGHT : PARCHMENT}
          fontWeight="bold"
          pointerEvents="none"
          aria-hidden="true"
          className="marker-ink"
        >
          {items.length}
        </text>
      </g>
    );
  };

  const renderCurrentLocation = () => {
    const c = currentHex ? hexCenterOf(currentHex) : null;
    if (!c) return null;
    const k = starRadius / STAR_RADIUS;
    return (
      <g pointerEvents="none" aria-hidden="true">
        {/* Forced colours (globals.css) would otherwise paint the star and its
            disc one colour. */}
        <circle cx={c.x} cy={c.y} r={starRadius} fill={GOLD} stroke={PARCHMENT} strokeWidth={STAR_RIM * k} className="marker-disc" />
        <text x={c.x} y={c.y + STAR_GLYPH_FONT * k * 0.32} textAnchor="middle" fontSize={STAR_GLYPH_FONT * k} fill={NIGHT} fontWeight="bold" className="marker-ink">
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
  const toolButton = 'bg-[#5a3a28] hover:bg-[#4a2f20] text-[#f5e6c8] rounded px-2 py-1 transition-colors';

  return (
    // The page's scroll padding keeps an element that focus moves to clear of
    // the sticky header (globals.css); scroll-mt leaves a little room under it.
    <div ref={rootRef} className="space-y-4 [&_[data-focus-key]]:scroll-mt-5">
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
          {/* Sits out a ley line being drawn — disabled, not removed, so that
              whatever was typed in it survives the draft. A hex picked then
              joins the line instead of opening in the inspector, which is what
              the "Go to hex" field beside this already does. */}
          <MapSearch
            pois={pois}
            fairyDoors={doors}
            leyLines={leyLines}
            onSelect={goToSearchHit}
            disabled={draft !== null}
          />
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
            <span className="text-[#9c948b] text-xs ml-auto basis-full md:basis-auto">
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
          the screen below the sticky header (its height comes from page.tsx),
          with room to spare, so the page can still be scrolled past it
          (dragging on the map pans the map): on a phone in landscape the map
          is letterboxed instead. */}
      <div
        ref={boxRef}
        className="bg-[#1a1a2e] rounded-lg overflow-hidden relative w-full aspect-(--map-aspect) md:aspect-auto md:h-[60vh] max-h-[calc(100svh-var(--sticky-header-height,4.75rem)-3.25rem)]"
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
          onFocus={handleMapFocus}
          onBlur={handleMapBlur}
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
          {renderCurrentLocation()}
          <g>{renderMarkers()}</g>
          {renderOutlines()}
        </svg>
      </div>

      {/* grid-cols-1, not the implicit column: that one grows to fit its
          widest content, and on a 320 px phone it pushed the page wider
          than the screen. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            journalCount={selectedHex ? journalCounts.get(selectedHex) ?? 0 : 0}
            onOpenJournal={onOpenJournal}
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
    const hex = parseTypedHex(raw);
    if (!hex) {
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
        className={`bg-[#1a1a2e] border ${border} text-[#f5e6c8] rounded px-2 py-1 text-base md:text-xs w-28 focus:outline-none placeholder:text-[#9c948b]`}
      />
      <button type="submit" className="bg-[#5a3a28] hover:bg-[#4a2f20] text-[#f5e6c8] rounded px-2 py-1 text-xs transition-colors">
        Go
      </button>
      <span id={statusId} role="status" className="text-xs text-[#ff8a70] min-w-0 [overflow-wrap:anywhere]">
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
      {/* Until the kind can be chosen, the type says what the path is. */}
      <input value={draft.type} onChange={(e) => edit({ type: e.target.value, kind: pathKindFromType(e.target.value) })} placeholder="Type (Ley line, Ward…)" aria-label="Ley line type" className={INPUT_ON_CARD} />
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
  journalCount,
  onOpenJournal,
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
  journalCount: number; // journal entries written in the selected hex
  onOpenJournal: (hex: HexCoord) => void;
  focus: ({ id: string } & FocusRequest) | null;
  onClose: () => void;
  moveFocusTo: (key: string) => void;
}) {
  if (!selectedHex) {
    return (
      <div className="bg-[#2a2a3e] rounded-lg p-4 text-sm text-[#a1988f] italic">
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
  const actionButton = 'bg-[#5a3a28] hover:bg-[#4a2f20] text-[#f5e6c8] rounded px-3 py-2 transition-colors';
  // After a delete, focus goes to the next item on the hex, or the title.
  const itemIds = [...pois.map((p) => p.id), ...doors.map((d) => d.id)];
  const focusAfterDelete = (id: string) => {
    const next = itemIds[itemIds.indexOf(id) + 1];
    moveFocusTo(next ? `item:${next}` : 'inspector-title');
  };

  const savePoi = (id: string, patch: Partial<Pick<MapPOI, 'name' | 'notes'>>) =>
    updateMap((md) => ({ ...md, pois: md.pois.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const savePoiKind = (id: string, kind: PoiKind) =>
    updateMap((md) => ({ ...md, pois: md.pois.map((x) => (x.id === id ? withPoiKind(x, kind) : x)) }));
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

      {journalCount > 0 && (
        <button
          type="button"
          onClick={() => onOpenJournal(selectedHex)}
          className={`text-[#c4a35a] hover:underline text-sm rounded px-1 py-1 -mx-1 ${FOCUS_RING}`}
        >
          Journal entries here ({journalCount.toLocaleString('en-US')}) <span aria-hidden="true">→</span>
        </button>
      )}

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
            className="bg-[#2d4a2e] hover:bg-[#3d6b3e] aria-disabled:outline-1 aria-disabled:outline-dashed aria-disabled:outline-[#9c948b] aria-disabled:hover:bg-[#2d4a2e] aria-disabled:cursor-default text-[#f5e6c8] rounded px-3 py-2 transition-colors"
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
                    onSaveKind={(kind) => savePoiKind(p.id, kind)}
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

/**
 * The kind of a point of interest, chosen by its icon: a group of radio
 * buttons, so Tab reaches the chosen one and the arrow keys choose the
 * others. The legend describes the tile under the pointer, falling back to the
 * chosen kind's. A touch screen can't hover, so there it shows the chosen kind
 * alone: a player who wants to know what another tile means taps it, which
 * chooses it, and can change it again. Focus needs no watching of its own,
 * because a radio group has one tab stop, the checked tile, and the arrow keys
 * check as they move, so the focused tile is always the chosen one.
 */
function PoiKindPicker({ kind, onChange }: { kind: PoiKind; onChange: (kind: PoiKind) => void }) {
  const name = useId();
  const [lookedAt, setLookedAt] = useState<PoiKind | null>(null);
  const described = lookedAt ?? kind;
  return (
    // min-w-0: a fieldset is otherwise never narrower than its content.
    <fieldset className="min-w-0">
      <legend className="text-xs text-[#f5e6c8]/70 mb-1">
        Kind
        {/* Hidden from screen readers, which announce the chosen radio button instead. */}
        <span aria-hidden="true">
          {' · '}
          <span className="text-[#f5e6c8]">{POI_KIND_LABELS[described]}</span>
        </span>
      </legend>
      {/* Even rows for the 15 kinds, as the space allows: 5 of 3, 3 of 5, 8 and
          7, or 1 of 15. Each tier starts where its tiles fit exactly (9.75rem =
          5 × 1.75rem + 4 gaps), so at a larger font size, where the rem tiers
          grow but the screen doesn't, the picker drops to fewer columns. */}
      <div className="@container">
        <div className="grid grid-cols-[repeat(3,1.75rem)] @min-[9.75rem]:grid-cols-[repeat(5,1.75rem)] @min-[15.75rem]:grid-cols-[repeat(8,1.75rem)] @min-[29.75rem]:grid-cols-[repeat(15,1.75rem)] gap-1">
          {POI_KINDS.map((k) => (
            <label
              key={k}
              // The description in the legend follows the pointer: a `title`
              // tooltip shows on neither a touch screen nor the keyboard, and
              // on a desktop it can be announced twice.
              onMouseEnter={() => setLookedAt(k)}
              onMouseLeave={() => setLookedAt(null)}
              // In forced colours only the chosen tile has a border, and a thicker one.
              className="relative flex items-center justify-center size-7 rounded border border-transparent cursor-pointer hover:bg-[#2a2a3e] has-checked:border-[#f5e6c8] has-checked:bg-[#5a3a28] forced-colors:border-[color:Canvas] forced-colors:has-checked:border-2 forced-colors:has-checked:border-[color:Highlight] has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-[#c4a35a]"
            >
              <input type="radio" name={name} value={k} checked={k === kind} onChange={() => onChange(k)} className="sr-only" />
              <PoiIcon kind={k} className="size-5" />
              <span className="sr-only">{POI_KIND_LABELS[k]}</span>
            </label>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

function POIForm({ hex, onSubmit, onCancel }: { hex: HexCoord; onSubmit: (p: MapPOI) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PoiKind>('other');
  const [notes, setNotes] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(withPoiKind({ id: newId(), hex, name: name.trim(), notes: notes.trim() }, kind));
  };
  return (
    <form onSubmit={submit} className="bg-[#1a1a2e] rounded p-2 mb-2 space-y-2">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Point of interest name" className={`w-full ${INPUT_ON_ITEM}`} />
      <PoiKindPicker kind={kind} onChange={setKind} />
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
  onSaveKind,
  onDelete,
}: {
  poi: MapPOI;
  singleton: boolean;
  focusRequest: FocusRequest | undefined;
  onSave: (patch: Partial<Pick<MapPOI, 'name' | 'notes'>>) => void;
  onSaveKind: (kind: PoiKind) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useExpanded(singleton, focusRequest?.seq);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useFocusOnRequest(focusRequest, rootRef, nameRef);
  const label = poi.name || 'unnamed';
  const kind = poiKindOf(poi);
  return (
    <div
      ref={rootRef}
      role="group"
      // Names the kind, which the row shows only as its (decorative) icon.
      aria-label={`${POI_KIND_NAMES[kind]}: ${label}`}
      tabIndex={-1}
      data-focus-key={`item:${poi.id}`}
      className={`bg-[#1a1a2e] rounded p-2 space-y-1 ${FOCUS_RING}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PoiIcon kind={kind} className="size-5 shrink-0" />
        <input
          ref={nameRef}
          value={poi.name}
          onChange={(e) => onSave({ name: e.target.value })}
          aria-label="Point of interest name"
          className={`flex-1 ${NAME_MIN_WIDTH} bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]`}
        />
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          aria-label={`Edit ${label}`}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors whitespace-nowrap"
        >
          Edit <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete POI ${label}`}
          className={DELETE_BUTTON}
        >
          Delete
        </button>
      </div>
      {expanded && (
        <div className="space-y-2 pt-1">
          <PoiKindPicker kind={kind} onChange={onSaveKind} />
          <textarea
            value={poi.notes}
            onChange={(e) => onSave({ notes: e.target.value })}
            placeholder="Notes"
            aria-label={`Notes for ${label}`}
            rows={3}
            className={`w-full ${INPUT_ON_ITEM}`}
          />
        </div>
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
      <div className="flex flex-wrap items-center gap-2">
        <DoorIcon className="size-5 shrink-0" />
        <input
          ref={nameRef}
          value={door.name}
          onChange={(e) => onSaveText({ name: e.target.value })}
          aria-label="Fairy door name"
          className={`flex-1 ${NAME_MIN_WIDTH} bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]`}
        />
        <span className="text-xs text-[#9c948b]">{door.destination.kind === 'wild' ? 'wild' : `→ ${partner?.hex ?? '?'}`}</span>
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
          aria-label={`Edit ${label}`}
          className="text-xs text-[#f5e6c8]/60 hover:text-[#f5e6c8] transition-colors whitespace-nowrap"
        >
          Edit <span aria-hidden="true">{expanded ? '▴' : '▾'}</span>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete fairy door ${label}`}
          className={DELETE_BUTTON}
        >
          Delete
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
        <div className="text-xs text-[#9c948b] italic">None yet. Use “Draw Ley Line” above.</div>
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
      <div className="flex flex-wrap items-center gap-2">
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
          className={`flex-1 ${NAME_MIN_WIDTH} bg-transparent text-[#f5e6c8] text-base md:text-sm focus:outline-none border-b border-transparent focus:border-[#c4a35a]`}
        />
        <span className="text-xs text-[#9c948b]">
          {leyLine.hexes.length} hex{leyLine.hexes.length === 1 ? '' : 'es'}
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ley line ${leyLine.name || 'unnamed'}`}
          className={DELETE_BUTTON}
        >
          Delete
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {/* Until the kind can be chosen, the type says what the path is. A
            line with fewer than 2 hexes stays a ley line: any other path
            needs 2, and loading would move it to Other Notes. */}
        <input
          value={leyLine.type}
          onChange={(e) =>
            onSave({ type: e.target.value, kind: leyLine.hexes.length < 2 ? leyLine.kind : pathKindFromType(e.target.value) })
          }
          placeholder="Type"
          aria-label={`Type of ${label}`}
          className={INPUT_ON_ITEM}
        />
        <input type="color" value={leyLine.color} onChange={(e) => onSave({ color: e.target.value })} aria-label={`Colour of ${label}`} className="bg-[#2a2a3e] border border-[#5a3a28] rounded h-8 md:h-6 w-full" />
        <input value={leyLine.notes} onChange={(e) => onSave({ notes: e.target.value })} placeholder="Notes" aria-label={`Notes for ${label}`} className={INPUT_ON_ITEM} />
      </div>
      <div className="text-[10px] text-[#9c948b] truncate">{leyLine.hexes.join(' → ')}</div>
    </div>
  );
}
