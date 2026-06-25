#!/usr/bin/env node
// Generates tools/view-extension/icon.png (128×128) — Nara the labrador
// No external dependencies — uses Node.js built-in zlib only
'use strict'

const zlib = require('zlib')
const fs   = require('fs')
const path = require('path')

const W = 128, H = 128
const buf = new Uint8ClampedArray(W * H * 4)

// ── Pixel helpers ─────────────────────────────────────────────────────────────

function px(x, y, r, g, b, a = 255) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || x >= W || y < 0 || y >= H) return
  const i = (y * W + x) * 4
  const ea = a / 255, ia = 1 - ea
  buf[i]   = buf[i]   * ia + r * ea
  buf[i+1] = buf[i+1] * ia + g * ea
  buf[i+2] = buf[i+2] * ia + b * ea
  buf[i+3] = 255
}

function circle(cx, cy, rad, r, g, b, a = 255) {
  for (let dy = -rad-1; dy <= rad+1; dy++) {
    for (let dx = -rad-1; dx <= rad+1; dx++) {
      const d = Math.sqrt(dx*dx + dy*dy)
      const aa = Math.max(0, Math.min(1, rad + 0.5 - d))
      if (aa > 0) px(cx+dx, cy+dy, r, g, b, a * aa)
    }
  }
}

function circleStroke(cx, cy, rad, sw, r, g, b, a = 255) {
  const limit = rad + sw + 1
  for (let dy = -limit; dy <= limit; dy++) {
    for (let dx = -limit; dx <= limit; dx++) {
      const d = Math.sqrt(dx*dx + dy*dy)
      const aa = Math.max(0, Math.min(1, sw * 0.5 + 0.5 - Math.abs(d - rad)))
      if (aa > 0) px(cx+dx, cy+dy, r, g, b, a * aa)
    }
  }
}

function ellipse(cx, cy, rx, ry, r, g, b, a = 255) {
  cx = Math.round(cx); cy = Math.round(cy)
  const mx = Math.ceil(rx + 1), my = Math.ceil(ry + 1)
  const sc = Math.min(rx, ry)
  for (let dy = -my; dy <= my; dy++) {
    for (let dx = -mx; dx <= mx; dx++) {
      const nd = Math.sqrt((dx/rx)*(dx/rx) + (dy/ry)*(dy/ry))
      const aa = Math.max(0, Math.min(1, (1 - nd) * sc + 0.5))
      if (aa > 0) px(cx+dx, cy+dy, r, g, b, a * aa)
    }
  }
}

function ellipseRot(cx, cy, rx, ry, angle, r, g, b, a = 255) {
  const cos = Math.cos(-angle), sin = Math.sin(-angle)
  const mx = Math.ceil(Math.max(rx, ry) + 1)
  const sc = Math.min(rx, ry)
  for (let dy = -mx; dy <= mx; dy++) {
    for (let dx = -mx; dx <= mx; dx++) {
      const rdx = dx * cos - dy * sin
      const rdy = dx * sin + dy * cos
      const nd = Math.sqrt((rdx/rx)*(rdx/rx) + (rdy/ry)*(rdy/ry))
      const aa = Math.max(0, Math.min(1, (1 - nd) * sc + 0.5))
      if (aa > 0) px(Math.round(cx)+dx, Math.round(cy)+dy, r, g, b, a * aa)
    }
  }
}

// Quadratic bezier stroke
function bezier(x0, y0, cx2, cy2, x1, y1, r, g, b, a = 255, sw = 1.5) {
  const steps = Math.ceil(Math.hypot(x1-x0, y1-y0) * 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, mt = 1 - t
    const bx = mt*mt*x0 + 2*mt*t*cx2 + t*t*x1
    const by = mt*mt*y0 + 2*mt*t*cy2 + t*t*y1
    const limit = Math.ceil(sw) + 1
    for (let dy = -limit; dy <= limit; dy++) {
      for (let dx = -limit; dx <= limit; dx++) {
        const aa = Math.max(0, Math.min(1, sw - Math.sqrt(dx*dx + dy*dy) + 0.5))
        if (aa > 0) px(bx+dx, by+dy, r, g, b, a * aa)
      }
    }
  }
}

// Thick vertical line
function lineV(x, y0, y1, r, g, b, a = 255, sw = 1.5) {
  for (let y = Math.round(y0); y <= Math.round(y1); y++) {
    const limit = Math.ceil(sw) + 1
    for (let dx = -limit; dx <= limit; dx++) {
      const aa = Math.max(0, Math.min(1, sw - Math.abs(dx) + 0.5))
      if (aa > 0) px(x + dx, y, r, g, b, a * aa)
    }
  }
}

// ── Background (linear gradient top-left #60C8F5 → bottom-right #2E8FD4) ─────

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H - 2)
    px(x, y,
      Math.round(96  + (46  - 96)  * t),
      Math.round(200 + (143 - 200) * t),
      Math.round(245 + (212 - 245) * t))
  }
}

// ── Nara (labrador, 128×128 — coords match SVG) ───────────────────────────────

const DEG = Math.PI / 180

// Ears (behind head — draw first so head covers inner edge)
ellipseRot( 24, 74, 16, 28, -10*DEG, 200, 186, 160)
ellipseRot(104, 74, 16, 28,  10*DEG, 200, 186, 160)

// Head
circle(64, 60, 40, 244, 239, 230)
circleStroke(64, 60, 40, 1.5, 216, 206, 188)

// Muzzle
ellipse(64, 78, 20, 16, 253, 250, 247)

// Cheeks blush
circle(37, 70, 10, 249, 168, 212, 89)
circle(91, 70, 10, 249, 168, 212, 89)

// Eyebrows
bezier(41, 44, 48, 41, 55, 44, 168, 146, 120, 200, 2.5)
bezier(73, 44, 80, 41, 87, 44, 168, 146, 120, 200, 2.5)

// Eyes
circle(48, 55, 10, 45, 27, 14)
circle(80, 55, 10, 45, 27, 14)
// Eye highlights
circle(51, 51, 3.5, 255, 255, 255)
circle(83, 51, 3.5, 255, 255, 255)

// Nose
ellipse(64, 74, 10, 7, 28, 17, 8)
ellipse(61, 71, 2.5, 1.8, 255, 255, 255, 77)   // nose highlight

// Mouth
bezier(56, 83, 64, 89, 72, 83, 139, 69, 19, 255, 2)

// Tongue
ellipse(64, 91, 10, 7, 244, 114, 182)
lineV(64, 85, 97, 219, 39, 119, 255, 1.5)   // tongue crease

// ── Rounded-rect clip (r=20) applied last so it always masks corners ──────────

const RX = 20
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = x < RX ? RX : x > W-1-RX ? W-1-RX : x
    const cy = y < RX ? RX : y > H-1-RX ? H-1-RX : y
    if ((x !== cx || y !== cy) && Math.hypot(x-cx, y-cy) > RX)
      buf[(y*W+x)*4+3] = 0
  }
}

// ── PNG encoding ──────────────────────────────────────────────────────────────

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c
}

function crc32(data) {
  let crc = 0xFFFFFFFF
  for (const b of data) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const typ = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typ, data])))
  return Buffer.concat([len, typ, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 6   // bit-depth=8, color-type=RGBA

const raw = Buffer.alloc(H * (1 + W * 4))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W*4)] = 0
  for (let x = 0; x < W; x++) {
    const s = (y*W + x) * 4
    const d = y * (1 + W*4) + 1 + x * 4
    raw[d]=buf[s]; raw[d+1]=buf[s+1]; raw[d+2]=buf[s+2]; raw[d+3]=buf[s+3]
  }
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
])

const out = path.join(__dirname, '..', 'tools', 'view-extension', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, png)
console.log(`Generated: ${out}  (${png.length} bytes)`)
