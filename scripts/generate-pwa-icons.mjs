import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUTPUT_DIR = path.resolve('public', 'icons');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Minimal pure-Node PNG encoder using zlib.deflateSync + CRC32
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, crcInput, crcBuf]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: None
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function sdRoundedBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function sdSegment(px, py, ax, ay, bx, by) {
  const pax = px - ax;
  const pay = py - ay;
  const bax = bx - ax;
  const bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
}

function mixColor(bg, fg, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return [
    bg[0] * (1 - a) + fg[0] * a,
    bg[1] * (1 - a) + fg[1] * a,
    bg[2] * (1 - a) + fg[2] * a,
    bg[3] * (1 - a) + 255 * a,
  ];
}

function lerpColor(c1, c2, t) {
  const u = Math.max(0, Math.min(1, t));
  return [
    c1[0] + (c2[0] - c1[0]) * u,
    c1[1] + (c2[1] - c1[1]) * u,
    c1[2] + (c2[2] - c1[2]) * u,
    255,
  ];
}

function sampleIconPixel(nx, ny, maskable) {
  // Normalized coordinate space [0..512]
  const x = nx * 512;
  const y = ny * 512;
  const gradT = (nx + ny) * 0.5;
  const bgColor = lerpColor([15, 23, 42], [30, 41, 59], gradT);

  let col = [0, 0, 0, 0];

  if (maskable) {
    col = bgColor;
  } else {
    const sqDist = sdRoundedBox(x, y, 256, 256, 240, 240, 112);
    if (sqDist > 1.5) return [0, 0, 0, 0];
    const sqAlpha = Math.max(0, Math.min(1, 0.5 - sqDist));
    col = [bgColor[0], bgColor[1], bgColor[2], 255 * sqAlpha];
    // Subtle border ring
    const borderDist = Math.abs(sqDist + 3) - 3;
    if (borderDist < 1) {
      const ba = Math.max(0, Math.min(1, 0.5 - borderDist)) * sqAlpha;
      col = mixColor(col, [51, 65, 85], ba);
      col[3] = 255 * sqAlpha;
    }
  }

  // Transform coordinates for maskable safe-zone (74% centered)
  const gx = maskable ? (x - 66.5) / 0.74 : x;
  const gy = maskable ? (y - 66.5) / 0.74 : y;
  const scaleAA = maskable ? 0.74 : 1;

  // Blueprint grid accents on standard icon
  if (!maskable) {
    const onGrid =
      Math.min(
        Math.abs(gx - 128),
        Math.abs(gx - 256),
        Math.abs(gx - 384),
        Math.abs(gy - 160),
        Math.abs(gy - 286),
        Math.abs(gy - 378),
      ) < 1.2 &&
      gx > 48 &&
      gx < 464 &&
      gy > 48 &&
      gy < 464;
    if (onGrid) {
      col = mixColor(col, [56, 189, 248], 0.09);
    }
  }

  // Structural "A" beams
  const beamRadius = 13.5;
  const dLegL = sdSegment(gx, gy, 132, 378, 256, 122) - beamRadius;
  const dLegR = sdSegment(gx, gy, 256, 122, 380, 378) - beamRadius;
  const dBar = sdSegment(gx, gy, 176.5, 286, 335.5, 286) - beamRadius;
  const dBeams = Math.min(dLegL, dLegR, dBar);
  if (dBeams < 1.5) {
    const a = Math.max(0, Math.min(1, 0.5 - dBeams * scaleAA));
    col = mixColor(col, [241, 245, 249], a);
  }

  // Center junction hub on crossbar
  const dHubDist = Math.hypot(gx - 256, gy - 286);
  if (dHubDist < 26) {
    const outerA = Math.max(0, Math.min(1, 25.5 - dHubDist));
    col = mixColor(col, [56, 189, 248], outerA);
    if (dHubDist < 17) {
      const innerA = Math.max(0, Math.min(1, 16.5 - dHubDist));
      col = mixColor(col, [15, 23, 42], innerA);
    }
    if (dHubDist < 6.5) {
      const dotA = Math.max(0, Math.min(1, 6 - dHubDist));
      col = mixColor(col, [241, 245, 249], dotA);
    }
  }

  // Three colored vertex nodes with crisp dark cutout border
  const nodes = [
    { cx: 256, cy: 123, hw: 46, hh: 31, c1: [56, 189, 248], c2: [2, 132, 199], lineC: [224, 242, 254] },
    { cx: 132, cy: 378, hw: 46, hh: 31, c1: [129, 140, 248], c2: [79, 70, 229], lineC: [238, 242, 255] },
    { cx: 380, cy: 378, hw: 46, hh: 31, c1: [45, 212, 191], c2: [13, 148, 136], lineC: [204, 251, 241] },
  ];

  for (const n of nodes) {
    const outer = sdRoundedBox(gx, gy, n.cx, n.cy, n.hw + 5, n.hh + 5, 19);
    if (outer < 1.5) {
      const oa = Math.max(0, Math.min(1, 0.5 - outer));
      col = mixColor(col, [15, 23, 42], oa);
    }
    const inner = sdRoundedBox(gx, gy, n.cx, n.cy, n.hw, n.hh, 15);
    if (inner < 1.5) {
      const ia = Math.max(0, Math.min(1, 0.5 - inner));
      const nt = (gx - (n.cx - n.hw)) / (n.hw * 2);
      const fill = lerpColor(n.c1, n.c2, nt);
      col = mixColor(col, fill, ia);
      // Inner bar highlight
      const bar1 = sdRoundedBox(gx, gy, n.cx, n.cy - 5, 24, 4, 3.5);
      const bar2 = sdRoundedBox(gx, gy, n.cx, n.cy + 8, 14, 3, 2.5);
      const barD = Math.min(bar1, bar2);
      if (barD < 1.2) {
        col = mixColor(col, n.lineC, Math.max(0, Math.min(1, 0.5 - barD)) * 0.92);
      }
    }
  }

  return col;
}

function renderIcon(size, maskable, filename) {
  const rgba = Buffer.alloc(size * size * 4);
  const ss = 4; // 4x4 supersampling for smooth crisp edges
  const invTotal = 1 / (ss * ss);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size;
          const ny = (y + (sy + 0.5) / ss) / size;
          const px = sampleIconPixel(nx, ny, maskable);
          r += px[0];
          g += px[1];
          b += px[2];
          a += px[3];
        }
      }
      const idx = (y * size + x) * 4;
      rgba[idx] = Math.round(r * invTotal);
      rgba[idx + 1] = Math.round(g * invTotal);
      rgba[idx + 2] = Math.round(b * invTotal);
      rgba[idx + 3] = Math.round(a * invTotal);
    }
  }

  const outPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outPath, encodePng(size, size, rgba));
  console.log(`Generated ${outPath} (${size}x${size})`);
}

renderIcon(192, false, 'icon-192.png');
renderIcon(512, false, 'icon-512.png');
renderIcon(512, true, 'icon-maskable-512.png');
renderIcon(180, false, 'apple-touch-icon.png');
