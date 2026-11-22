// The map's marker icons: a round marker for each point of interest and fairy
// door, with a hand-drawn glyph for its kind (src/lib/map-glyphs.ts). The map
// draws them as markers (MarkerShape). As small HTML images, the hex inspector
// shows them beside its items (PoiIcon, DoorIcon), and the kind picker shows
// one on each tile (PoiIcon). They're decorative: the marker or control that
// shows one carries the name.
//
// Under forced colours the browser would paint the disc, the rim and the glyph
// one colour, leaving every kind looking the same. Each shape therefore carries
// a class that globals.css points at a system colour: the disc and the glyph's
// cut-outs stay Canvas, while the rim and the glyph itself stay CanvasText.
import { memo, type SVGProps } from 'react';
import type { PoiKind } from '@/lib/types';
import { POI_KINDS } from '@/lib/map-data';
import { DOOR_GLYPH, GLYPH_CENTER, GLYPH_EXTENT, POI_GLYPHS, type Glyph, type GlyphKind } from '@/lib/map-glyphs';

// The theme's colours, which the rest of the map uses too.
export const PARCHMENT = '#f5e6c8';
export const NIGHT = '#1a1a2e';
export const GOLD = '#c4a35a';
// The markers' own: a point of interest without a kind ('other') keeps the
// plain red marker it had before kinds; fairy doors are lavender.
const POI_FILL = '#8b2500';
export const DOOR_FILL = '#a774d6';

/** What a marker looks like: its disc, its rim and, unless it's a plain one, its glyph. */
export interface MarkerLook {
  fill: string;
  rim: string;
  glyph: Glyph | null;
  /** The glyph's colour. Its cut-out details take the disc's colour. */
  ink: string;
}

// Each look is made once, so that a marker gets the same object on every
// render and MarkerShape (memoised) can skip it while the map pans.
const KIND_LOOKS = Object.fromEntries(
  POI_KINDS.filter((k): k is GlyphKind => k !== 'other').map((k) => [k, { fill: NIGHT, rim: GOLD, glyph: POI_GLYPHS[k], ink: PARCHMENT }]),
) as Record<GlyphKind, MarkerLook>;
const PLAIN_POI: MarkerLook = { fill: POI_FILL, rim: PARCHMENT, glyph: null, ink: PARCHMENT };
const DOOR: MarkerLook = { fill: DOOR_FILL, rim: PARCHMENT, glyph: DOOR_GLYPH, ink: NIGHT };

/**
 * The marker of a point of interest of kind `kind`, or of a fairy door. A
 * kind's marker is a dark disc with a gold rim and a parchment glyph; 'other'
 * keeps the plain red marker.
 */
export function markerLook(kind: PoiKind | 'door'): MarkerLook {
  if (kind === 'door') return DOOR;
  if (kind === 'other') return PLAIN_POI;
  return KIND_LOOKS[kind];
}

// How much of the disc inside its rim the glyph's extent takes up.
const GLYPH_FILL = 0.9;

/**
 * A marker centred on (cx, cy): a disc of radius `r` with a rim `rim` wide
 * (half of it outside `r`), and its glyph. Drawn in the units of the
 * surrounding SVG.
 */
export const MarkerShape = memo(function MarkerShape({ look, cx, cy, r, rim }: {
  look: MarkerLook;
  cx: number;
  cy: number;
  r: number;
  rim: number;
}) {
  const scale = ((r - rim / 2) * GLYPH_FILL) / GLYPH_EXTENT;
  return (
    <>
      <circle cx={cx} cy={cy} r={r} fill={look.fill} stroke={look.rim} strokeWidth={rim} className="marker-disc" />
      {look.glyph && (
        <g
          transform={`translate(${cx} ${cy}) scale(${scale}) translate(${-GLYPH_CENTER} ${-GLYPH_CENTER})`}
          pointerEvents="none"
          aria-hidden="true"
        >
          {look.glyph.body.map((d, i) => (
            <path key={`body-${i}`} d={d} fill={look.ink} className="marker-glyph" />
          ))}
          {look.glyph.cut.map((d, i) => (
            <path key={`cut-${i}`} d={d} fill={look.fill} className="marker-glyph-cut" />
          ))}
        </g>
      )}
    </>
  );
});

// An icon is always decorative, so its callers can't set these (the spread
// below would override them), nor the viewBox it draws in.
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox' | 'aria-hidden' | 'focusable'>;

/** A marker as a small inline image, for HTML: decorative, hidden from assistive technology. */
function MarkerIcon({ look, ...props }: IconProps & { look: MarkerLook }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <MarkerShape look={look} cx={12} cy={12} r={11} rim={1.5} />
    </svg>
  );
}

/** The marker of a point of interest of kind `kind`, as a small inline image. */
export function PoiIcon({ kind, ...props }: IconProps & { kind: PoiKind }) {
  return <MarkerIcon look={markerLook(kind)} {...props} />;
}

/** A fairy door's marker, as a small inline image. */
export function DoorIcon(props: IconProps) {
  return <MarkerIcon look={DOOR} {...props} />;
}
