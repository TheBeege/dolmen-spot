// Rebuilds the raster app icons from src/app/icon.svg:
//
//   src/app/favicon.ico      16, 32 and 48 px, for browsers that ask for /favicon.ico
//   src/app/apple-icon.png   180 x 180, opaque, for iOS home screens
//
// Usage (after `npm ci`):  node scripts/generate-icons.mjs
//
// Next.js picks all three files up by its metadata file conventions and adds
// the <link> tags itself. The SVG is rasterized with sharp (librsvg), a
// devDependency on the same version range as Next.js's own sharp, so npm
// installs a single copy and no system tools are needed. Each size is
// rendered straight from the vector, never resampled, and the output is
// byte-for-byte reproducible for a given sharp version.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch (error) {
  // Any other failure, such as sharp's native binary not loading after an
  // install on another OS, comes with sharp's own explanation and fix.
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  console.error('generate-icons: sharp is not installed. Run `npm ci` first.');
  process.exit(1);
}

const appDir = fileURLToPath(new URL('../src/app/', import.meta.url));
const FAVICON_SIZES = [16, 32, 48];
const APPLE_ICON_SIZE = 180;
// The mark is drawn at 80% and padded with the tile colour, so it isn't
// crowded once iOS rounds the corners.
const APPLE_ARTWORK_SIZE = 144;

const svg = await readFile(appDir + 'icon.svg');
const { width: svgSize, height: svgHeight } = await sharp(svg).metadata();
if (svgSize !== svgHeight) throw new Error(`icon.svg must be square, got ${svgSize}x${svgHeight}`);

/** Renders the SVG at exactly size x size px and returns it as an RGBA PNG. */
async function render(size) {
  const { data, info } = await sharp(svg, { density: (72 * size) / svgSize })
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) {
    throw new Error(`rendered ${info.width}x${info.height}, expected ${size}x${size}`);
  }
  return data;
}

/** Packs square PNGs into an .ico file (PNG-compressed entries). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0); // width (0 means 256)
    entry.writeUInt8(size % 256, 1); // height
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

async function write(name, data) {
  await writeFile(appDir + name, data);
  console.log(`wrote src/app/${name} (${data.length} bytes)`);
}

const favicons = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, png: await render(size) })));
await write('favicon.ico', ico(favicons));

const artwork = await render(APPLE_ARTWORK_SIZE);
// Sample the tile colour from the middle of the artwork's left edge.
const { data: pixels } = await sharp(artwork).raw().toBuffer({ resolveWithObject: true });
const i = (APPLE_ARTWORK_SIZE / 2) * APPLE_ARTWORK_SIZE * 4;
const tile = { r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] };
const pad = (APPLE_ICON_SIZE - APPLE_ARTWORK_SIZE) / 2;
const appleIcon = await sharp(artwork)
  .flatten({ background: tile })
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: tile })
  .png({ compressionLevel: 9 })
  .toBuffer();
await write('apple-icon.png', appleIcon);
